// Residential rotating-proxy routing (DataImpulse). ENV-GATED: with no PROXY_*
// vars set, every export is a no-op and scraping uses the direct connection — so
// this is safe to ship dormant and flip on per-run via .env.
//
// Only the AutoTrader HTML scrape host (www.autotrader.co.za) is proxied — NOT
// img.autotrader.co.za (the image CDN: heavy bytes, not rate-limited the same
// way). A rotating residential IP per request defeats AT's per-IP rate limiter
// without paying proxy bandwidth for image downloads.
//
//   .env:
//     PROXY_HOST=gw.dataimpulse.com
//     PROXY_PORT=823
//     PROXY_USER=<your-login>__cr.za     # __cr.za = exit from South Africa
//     PROXY_PASS=<your-password>

const HOST = process.env.PROXY_HOST ?? '';
const PORT = process.env.PROXY_PORT ?? '823';
const USER = process.env.PROXY_USER ?? '';
const PASS = process.env.PROXY_PASS ?? '';

// Hosts to route through the proxy. Deliberately the scrape host only.
const PROXIED_HOSTS = new Set(['www.autotrader.co.za']);

export function proxyEnabled(): boolean {
  return Boolean(HOST && USER && PASS);
}

let _agent: unknown = null;
let _announced = false;
async function getAgent(): Promise<unknown> {
  if (!_agent) {
    // Lazy import so the Astro/Fly build (where PROXY_* is never set) never has
    // to bundle undici.
    const { ProxyAgent } = await import('undici');
    _agent = new ProxyAgent({
      uri: `http://${HOST}:${PORT}`,
      token: `Basic ${Buffer.from(`${USER}:${PASS}`).toString('base64')}`,
    });
    if (!_announced) {
      console.log(`[proxy] routing ${[...PROXIED_HOSTS].join(', ')} via ${HOST}:${PORT}`);
      _announced = true;
    }
  }
  return _agent;
}

// Returns an undici dispatcher to route `url` through the proxy, or undefined to
// go direct. Pass the result as the (non-standard) `dispatcher` option on fetch.
export async function dispatcherFor(url: string): Promise<unknown | undefined> {
  if (!proxyEnabled()) return undefined;
  let host: string;
  try { host = new URL(url).host; } catch { return undefined; }
  return PROXIED_HOSTS.has(host) ? getAgent() : undefined;
}
