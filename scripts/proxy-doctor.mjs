// Proxy doctor — answers "is the residential proxy usable from HERE?" in ~30s.
//
// Built 2026-08-26, when AutoTrader ingest failed on alternate days from GitHub
// Actions with nothing but "TypeError: fetch failed", while the identical code,
// account and target worked every time from Wesley's Mac. The DataImpulse
// dashboard showed those runs' requests arriving and returning exactly 224 bytes
// each (a real page is ~375 KB), so the tunnel was being answered — just not
// with a page. This probe separates the layers that a bare "fetch failed" mashes
// together:
//
//   1. DNS + TCP to the proxy gateway   → is the gateway even reachable?
//   2. Raw CONNECT tunnel               → what does the proxy ANSWER? (a 4xx/5xx
//      here is the whole diagnosis, and it's what undici hides in err.cause)
//   3. undici ProxyAgent fetch          → the exact path the scrapers use
//   4. Direct fetch, no proxy           → what this runner's own IP gets from AT
//
// Manual-only (.github/workflows/proxy-doctor.yml) — run it from the environment
// that's failing. Secrets are never printed, only the shape of what came back.
import net from 'node:net';
import dns from 'node:dns/promises';
import { fetch as ufetch, ProxyAgent } from 'undici';

// PROXY_DOCTOR_HOST pins a specific gateway POP (an IP is fine — the proxy leg
// is plain HTTP CONNECT, no TLS to the gateway, so there's no certificate to
// match). Point it at a POP known to work from elsewhere to test whether the
// DNS geo-routing is what's picking a broken one.
const HOST = process.env.PROXY_DOCTOR_HOST || process.env.PROXY_HOST || '';
const PORT = Number(process.env.PROXY_PORT ?? 823);
const USER = process.env.PROXY_USER ?? '';
const PASS = process.env.PROXY_PASS ?? '';
const TARGET = process.env.PROXY_DOCTOR_TARGET ?? 'www.autotrader.co.za';
const TARGET_URL = `https://${TARGET}/cars-for-sale/toyota/land-cruiser-79`;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const mask = s => (s.length <= 6 ? '***' : `${s.slice(0, 4)}…${s.slice(-2)}`);

function causeChain(e) {
  const parts = [];
  let cur = e;
  for (let d = 0; cur && d < 5; d++) {
    parts.push(`${cur.name ?? 'Error'}: ${cur.message ?? String(cur)}${cur.code ? ` [${cur.code}]` : ''}`);
    cur = cur.cause;
  }
  return parts.join('\n     ← ');
}

if (!HOST || !USER || !PASS) {
  console.error('PROXY_* env not set — nothing to test.');
  process.exit(1);
}
console.log(`gateway : ${HOST}:${PORT}`);
console.log(`user    : ${mask(USER)}   (country suffix: ${USER.includes('__cr.') ? USER.slice(USER.indexOf('__cr.')) : 'none'})`);
console.log(`target  : ${TARGET}\n`);

// ── 1. DNS ────────────────────────────────────────────────────────────────────
try {
  const addrs = await dns.lookup(HOST, { all: true });
  console.log(`1. DNS      OK — ${addrs.map(a => a.address).join(', ')}`);
} catch (e) {
  console.log(`1. DNS      FAILED — ${causeChain(e)}`);
  process.exit(1);
}

// ── 2. Raw CONNECT: what does the proxy actually say? ─────────────────────────
const connectResult = await new Promise(resolve => {
  const sock = net.connect({ host: HOST, port: PORT });
  let buf = '';
  const done = r => { sock.destroy(); resolve(r); };
  sock.setTimeout(30_000, () => done({ ok: false, detail: 'timed out waiting for the CONNECT reply' }));
  sock.on('error', e => done({ ok: false, detail: `${e.code ?? ''} ${e.message}`.trim() }));
  sock.on('connect', () => {
    const auth = Buffer.from(`${USER}:${PASS}`).toString('base64');
    sock.write(
      `CONNECT ${TARGET}:443 HTTP/1.1\r\nHost: ${TARGET}:443\r\n` +
      `Proxy-Authorization: Basic ${auth}\r\n\r\n`,
    );
  });
  sock.on('data', d => {
    buf += d.toString('latin1');
    if (buf.includes('\r\n\r\n')) {
      const head = buf.split('\r\n\r\n')[0];
      done({ ok: /^HTTP\/1\.[01] 200/.test(head), detail: head, bytes: Buffer.byteLength(buf) });
    }
  });
});
console.log(`2. CONNECT  ${connectResult.ok ? 'OK' : 'REFUSED'} — ${connectResult.bytes ?? 0} bytes`);
for (const line of String(connectResult.detail).split('\r\n')) console.log(`            ${line}`);

// ── 3. The scrapers' actual path ──────────────────────────────────────────────
const agent = new ProxyAgent({
  uri: `http://${HOST}:${PORT}`,
  token: `Basic ${Buffer.from(`${USER}:${PASS}`).toString('base64')}`,
});
for (let i = 1; i <= 3; i++) {
  const t = Date.now();
  try {
    const res = await ufetch(TARGET_URL, {
      dispatcher: agent,
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-ZA,en;q=0.9' },
    });
    const body = await res.text();
    console.log(`3.${i} PROXIED HTTP ${res.status} — ${body.length} bytes in ${Date.now() - t}ms${body.length < 4000 ? `\n     BODY: ${JSON.stringify(body.slice(0, 300))}` : ''}`);
  } catch (e) {
    console.log(`3.${i} PROXIED FAILED in ${Date.now() - t}ms\n     ${causeChain(e)}`);
  }
}

// ── 4. What this machine's own IP gets ────────────────────────────────────────
try {
  const t = Date.now();
  const res = await fetch(TARGET_URL, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(30_000) });
  const body = await res.text();
  console.log(`4. DIRECT   HTTP ${res.status} — ${body.length} bytes in ${Date.now() - t}ms (no proxy; datacenter IP)`);
} catch (e) {
  console.log(`4. DIRECT   FAILED — ${causeChain(e)}`);
}

// ── 5. The library's own selection path (what the scrapers actually do) ───────
// Raw probes above answer "is this gateway usable"; this answers "does our code
// FIND a usable one from here", which is the question that matters.
if (!process.env.PROXY_DOCTOR_HOST) {
  const { primeGateway, proxyFetch, proxyFellBack } = await import('../src/lib/sources/proxy.ts');
  const picked = await primeGateway();
  console.log(`5. LIBRARY  picked gateway ${picked}${picked === HOST ? ' (hostname — no candidate probed clean)' : ''}`);
  for (let i = 1; i <= 3; i++) {
    const t = Date.now();
    try {
      const res = await proxyFetch(TARGET_URL, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
      const body = await res.text();
      console.log(`5.${i} HTTP ${res.status} — ${body.length} bytes in ${Date.now() - t}ms  (fell back to direct: ${proxyFellBack()})`);
    } catch (e) {
      console.log(`5.${i} FAILED in ${Date.now() - t}ms\n     ${causeChain(e)}`);
    }
  }
}
