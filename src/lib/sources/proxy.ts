// Residential rotating-proxy routing (DataImpulse). ENV-GATED: with no PROXY_*
// vars set, proxyFetch is just the global fetch and scraping uses the direct
// connection — safe to ship dormant and flip on per-run via .env.
//
// Only the AutoTrader HTML scrape host (www.autotrader.co.za) is proxied — NOT
// img.autotrader.co.za (image CDN: heavy bytes, not rate-limited the same way).
// A rotating residential IP per request defeats AT's per-IP rate limiter without
// paying proxy bandwidth for image downloads.
//
//   .env:
//     PROXY_HOST=gw.dataimpulse.com
//     PROXY_PORT=823
//     PROXY_USER=<login>__cr.za      # __cr.za = exit from South Africa
//     PROXY_PASS=<password>
//
// NB: the proxy path uses undici's OWN fetch + ProxyAgent. Node's global fetch
// rejects a ProxyAgent from the installed undici package (different undici
// instance → UND_ERR_INVALID_ARG), so the two must come from the same import.

const HOST = process.env.PROXY_HOST ?? '';
const PORT = process.env.PROXY_PORT ?? '823';
const USER = process.env.PROXY_USER ?? '';
const PASS = process.env.PROXY_PASS ?? '';

const PROXIED_HOSTS = new Set(['www.autotrader.co.za']);

export function proxyEnabled(): boolean {
  return Boolean(HOST && USER && PASS);
}

function shouldProxy(url: string): boolean {
  if (!proxyEnabled()) return false;
  try { return PROXIED_HOSTS.has(new URL(url).host); } catch { return false; }
}

type UndiciFetch = (url: string, init?: Record<string, unknown>) => Promise<unknown>;
let _undiciFetch: UndiciFetch | null = null;
let _agent: unknown = null;
let _announced = false;

// ─── Gateway (POP) selection ──────────────────────────────────────────────────
//
// gw.dataimpulse.com is geo-routed, and the POP it hands GitHub Actions is not
// the one it hands a South African client:
//
//   ZA client subnet  → 67.213.114.47/.101   tunnels fine
//   Azure US subnet   → 64.34.81.65/.89/.101 accepts CONNECT, then every TLS
//                                            handshake through it times out
//
// That cost six AutoTrader runs and ~7,000 listings of freshness (2026-08-21→26)
// and looked exactly like "the proxy is down" from our side. Rather than pin an
// IP in a secret — invisible, and silently wrong the day DataImpulse renumbers —
// discover the candidates and let a health probe decide:
//
//   1. ask this machine's resolver (whatever POP it's routed to)
//   2. ask what a ZA client would be given (Google DoH + EDNS client subnet)
//   3. probe each candidate through the actual tunnel, keep the first that works
//
// Self-healing: if DataImpulse fixes the US POP, step 1 wins and nothing is
// pinned; if they renumber, the DoH answer moves with them. If NOTHING probes
// clean we keep the hostname and let proxyFetch's direct fallback take over.
//
// An ECS hint only needs to be *in* the country — any ZA range works, and it is
// never connected to.
const ZA_ECS_HINT = '41.116.0.0/24';
const PROBE_URL = 'https://www.autotrader.co.za/robots.txt';  // tiny, same tunnel + same target
const PROBE_TIMEOUT_MS = 12_000;
const PROBE_ATTEMPTS = 3;

let _gateway: string | null = null;   // resolved POP for this process

const isIpLiteral = (h: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h);

async function resolveLocal(host: string): Promise<string[]> {
  try {
    const { resolve4 } = await import('node:dns/promises');
    return await resolve4(host);
  } catch { return []; }
}

async function resolveAsZaClient(host: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(host)}&type=A&edns_client_subnet=${ZA_ECS_HINT}`,
      { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return [];
    const data = await res.json() as { Answer?: { type: number; data: string }[] };
    return (data.Answer ?? []).filter(a => a.type === 1).map(a => a.data);
  } catch { return []; }
}

// One real request through a candidate POP. Probing the ACTUAL proxied target
// matters: the failure mode is a tunnel that opens and then can't reach that
// host, so a generic "is the proxy alive" check would pass and tell us nothing.
//
// RETRIED, because a healthy POP still throws the odd 500 on CONNECT (observed
// 2026-08-26: attempt 1 refused, attempts 2 and 3 returned the full page). A
// single-shot probe is a coin flip and would disqualify the good POP half the
// time — which is exactly what it did on the first version of this code.
async function probeGateway(ip: string, attempts = PROBE_ATTEMPTS): Promise<boolean> {
  const undici = await import('undici');
  const agent = new undici.ProxyAgent({
    uri: `http://${ip}:${PORT}`,
    token: `Basic ${Buffer.from(`${USER}:${PASS}`).toString('base64')}`,
  });
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await (undici.fetch as unknown as UndiciFetch)(PROBE_URL, {
        dispatcher: agent,
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      }) as Response;
      await res.text();
      if (res.ok) return true;
    } catch { /* try the next attempt */ }
  }
  return false;
}

async function pickGateway(): Promise<string> {
  if (isIpLiteral(HOST)) return HOST;   // explicitly pinned — respect it, don't second-guess

  const local = await resolveLocal(HOST);
  const za = await resolveAsZaClient(HOST);
  const candidates = [...new Set([...local, ...za])];
  if (!candidates.length) return HOST;

  for (const ip of candidates) {
    if (await probeGateway(ip)) {
      const via = local.includes(ip) ? 'local DNS' : 'ZA-routed';
      if (ip !== local[0]) {
        console.warn(`[proxy] gateway ${local[0] ?? '?'} (local DNS) failed its probe — using ${ip} (${via}) instead`);
      }
      return ip;
    }
    console.warn(`[proxy] gateway candidate ${ip} failed its probe`);
  }
  console.warn(`[proxy] ⚠️  no gateway candidate passed a probe (${candidates.join(', ')}) — going DIRECT for this run rather than paying a timeout per request`);
  _tunnelDead = true;
  return HOST;
}

// Resolve + cache the gateway. Safe to call repeatedly; only the first call works.
export async function primeGateway(): Promise<string> {
  if (!proxyEnabled()) return HOST;
  if (_gateway === null) _gateway = await pickGateway();
  return _gateway;
}

async function ensure(): Promise<void> {
  if (_agent && _undiciFetch) return;
  // Lazy import so the Astro/Fly build (PROXY_* never set there) never needs to
  // bundle undici.
  const undici = await import('undici');
  _undiciFetch = undici.fetch as unknown as UndiciFetch;
  const gateway = await primeGateway();
  _agent = new undici.ProxyAgent({
    uri: `http://${gateway}:${PORT}`,
    token: `Basic ${Buffer.from(`${USER}:${PASS}`).toString('base64')}`,
  });
  // NB: ProxyAgent's connect timeout is undici's 10s default and is NOT
  // configurable via `connect: { timeout }` here (verified 2026-08-26 — the
  // option is ignored, the error still reads "timeout: 10000ms"). A dead POP
  // therefore costs 10s per request, which is what the latch below is for.
  if (!_announced) {
    const label = gateway === HOST ? `${HOST}:${PORT}` : `${gateway}:${PORT} (POP chosen for ${HOST})`;
    console.log(`[proxy] routing ${[...PROXIED_HOSTS].join(', ')} via ${label}`);
    _announced = true;
  }
}

// A connection that never got off the ground — the proxy hop is broken, as
// opposed to the target answering with something we dislike. Only these justify
// bypassing the proxy; an HTTP 403/503 from the site must NOT (going direct
// would just feed the site's rate limiter our datacenter IP).
function isTunnelFailure(e: unknown): boolean {
  const CODES = new Set([
    'UND_ERR_CONNECT_TIMEOUT', 'ECONNRESET', 'ECONNREFUSED',
    'ETIMEDOUT', 'EPROTO', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE',
    // The gateway itself refusing to open the tunnel — undici surfaces this as
    // "Proxy response (500) !== 200 when HTTP Tunneling" under an ABORTED code,
    // which the first version of this check missed entirely, so the fallback
    // never fired and the whole fetch threw.
    'UND_ERR_ABORTED',
  ]);
  let cur = e as { code?: string; name?: string; message?: string; cause?: unknown } | undefined;
  for (let depth = 0; cur && depth < 4; depth++) {
    if ((cur.code && CODES.has(cur.code)) || cur.name === 'ConnectTimeoutError') return true;
    if (cur.message && /when HTTP Tunneling|Proxy response/i.test(cur.message)) return true;
    cur = cur.cause as typeof cur;
  }
  return false;
}

// Latched for the rest of the process once the tunnel proves unusable, so a
// broken POP costs one timeout instead of one per request.
let _tunnelDead = false;
let _tunnelFails = 0;
const TUNNEL_FAIL_LATCH = 3;   // consecutive REQUESTS, not attempts
const TUNNEL_RETRIES = 2;      // fresh tunnel per attempt (the gateway 500s sporadically)

// Drop-in for fetch(): routes the configured host(s) through the residential
// proxy (rotating IP per request), everything else direct. No-op when PROXY_*
// is unset.
//
// FALLS BACK TO DIRECT when the tunnel itself fails. On 2026-08-26 the gateway
// resolved to a different POP from GitHub Actions (64.34.81.x) than from the
// Mac (67.213.114.x); that POP accepted the CONNECT and then let every TLS
// handshake time out. Result: six dead AutoTrader runs, ~1,000 bare "fetch
// failed" lines, and 0 listings — while the SAME runner pulled the page
// directly, unproxied, in 1.4s. The residential IPs are worth keeping as the
// primary path (they're what defeats AutoTrader's per-IP rate limiter), but a
// broken proxy must degrade the crawl, never zero it.
export async function proxyFetch(url: string, init?: RequestInit): Promise<Response> {
  if (!shouldProxy(url) || _tunnelDead) return fetch(url, init);
  await ensure();

  // Retry through the proxy before conceding. Staying on residential IPs is
  // worth real effort: the direct path works for a request or two and then
  // AutoTrader 503s it (2026-08-26 — the fallback run captured 32 of ~7,000
  // before every page came back rate-limited), so a sporadic gateway 500 must
  // not cost us the rotation.
  for (let attempt = 0; attempt < TUNNEL_RETRIES; attempt++) {
    try {
      const res = await (_undiciFetch!(url, { ...init, dispatcher: _agent } as Record<string, unknown>) as Promise<Response>);
      _tunnelFails = 0;   // a good response clears the streak — only SUSTAINED failure latches
      return res;
    } catch (e) {
      if (!isTunnelFailure(e)) throw e;   // the site answered — that's the caller's problem
    }
  }

  _tunnelFails++;
  if (!_tunnelDead && _tunnelFails >= TUNNEL_FAIL_LATCH) {
    _tunnelDead = true;
    console.warn(`[proxy] ⚠️  tunnel failed on ${_tunnelFails} consecutive requests — DIRECT for the rest of this run (no residential rotation, so expect the target's per-IP rate limits)`);
  }
  return fetch(url, init);
}

// True once the proxy has been given up on this run — so a caller can report it.
export function proxyFellBack(): boolean {
  return _tunnelDead;
}

// Playwright proxy config for Cloudflare-cleared sources (carsza). Uses a STICKY
// session (`;sessid.<id>`) so the same residential IP holds the CF clearance for
// the whole run. Returns undefined when PROXY_* is unset → direct (the Mac's own
// residential IP, headed Chrome).
export function playwrightProxy(sessionId = 'lcsa'): { server: string; username: string; password: string } | undefined {
  if (!proxyEnabled()) return undefined;
  // Uses the probed POP when primeGateway() has been awaited first (carsza does);
  // falls back to the hostname otherwise, which is the old behaviour.
  return {
    server: `http://${_gateway ?? HOST}:${PORT}`,
    username: `${USER};sessid.${sessionId}`,
    password: PASS,
  };
}
