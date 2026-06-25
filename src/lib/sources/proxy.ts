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
  if (!_announced) {
    console.log(`[proxy] routing ${[...PROXIED_HOSTS].join(', ')} via ${HOST}:${PORT}`);
    _announced = true;
  }
}

// Drop-in for fetch(): routes the configured host(s) through the residential
// proxy (rotating IP per request), everything else direct. No-op when PROXY_*
// is unset.
export async function proxyFetch(url: string, init?: RequestInit): Promise<Response> {
  if (!shouldProxy(url)) return fetch(url, init);
  await ensure();
  return _undiciFetch!(url, { ...init, dispatcher: _agent } as Record<string, unknown>) as Promise<Response>;
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
