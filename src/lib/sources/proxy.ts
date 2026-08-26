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

async function ensure(): Promise<void> {
  if (_agent && _undiciFetch) return;
  // Lazy import so the Astro/Fly build (PROXY_* never set there) never needs to
  // bundle undici.
  const undici = await import('undici');
  _undiciFetch = undici.fetch as unknown as UndiciFetch;
  _agent = new undici.ProxyAgent({
    uri: `http://${HOST}:${PORT}`,
    token: `Basic ${Buffer.from(`${USER}:${PASS}`).toString('base64')}`,
  });
  // NB: ProxyAgent's connect timeout is undici's 10s default and is NOT
  // configurable via `connect: { timeout }` here (verified 2026-08-26 — the
  // option is ignored, the error still reads "timeout: 10000ms"). A dead POP
  // therefore costs 10s per request, which is what the latch below is for.
  if (!_announced) {
    console.log(`[proxy] routing ${[...PROXIED_HOSTS].join(', ')} via ${HOST}:${PORT}`);
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
  ]);
  let cur = e as { code?: string; name?: string; cause?: unknown } | undefined;
  for (let depth = 0; cur && depth < 4; depth++) {
    if ((cur.code && CODES.has(cur.code)) || cur.name === 'ConnectTimeoutError') return true;
    cur = cur.cause as typeof cur;
  }
  return false;
}

// Latched for the rest of the process once the tunnel proves unusable, so a
// broken POP costs one timeout instead of one per request.
let _tunnelDead = false;
let _tunnelFails = 0;
const TUNNEL_FAIL_LATCH = 3;

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
  try {
    return await (_undiciFetch!(url, { ...init, dispatcher: _agent } as Record<string, unknown>) as Promise<Response>);
  } catch (e) {
    if (!isTunnelFailure(e)) throw e;   // the site answered — that's the caller's problem
    _tunnelFails++;
    if (!_tunnelDead && _tunnelFails >= TUNNEL_FAIL_LATCH) {
      _tunnelDead = true;
      console.warn(`[proxy] ⚠️  tunnel failed ${_tunnelFails}x via ${HOST}:${PORT} — DIRECT for the rest of this run (no residential rotation, so expect the target's per-IP rate limits)`);
    }
    return fetch(url, init);
  }
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
  return {
    server: `http://${HOST}:${PORT}`,
    username: `${USER};sessid.${sessionId}`,
    password: PASS,
  };
}
