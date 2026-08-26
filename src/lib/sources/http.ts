const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Thrown when a site rate-limits / WAF-blocks this IP (HTTP 429, or a 503 block
// page). Distinct from a normal fetch failure so callers can ABORT the whole run
// instead of marching to the next item — hammering past a block only deepens and
// prolongs it (a 503 echoing your IP is a per-IP WAF limit, not a server fault).
export class RateLimitError extends Error {
  status: number;
  url: string;
  constructor(url: string, status: number) {
    super(`rate-limited (${status}): ${url}`);
    this.name = 'RateLimitError';
    this.status = status;
    this.url = url;
  }
}

import { proxyFetch } from './proxy.ts';

// undici reports every connection-level failure as a bare "TypeError: fetch
// failed" and buries the actual reason in err.cause. When the residential proxy
// is the failing hop, that cause IS the diagnosis — a dead gateway, refused
// auth, and an exhausted traffic allowance all print identically without it.
// (2026-08-21→26: six dead AutoTrader runs logged ~1,000 bare "fetch failed"
// lines and not one said what broke.) Walk the cause chain instead.
export function errDetail(e: unknown): string {
  const parts: string[] = [];
  let cur = e as { name?: string; message?: string; code?: string; cause?: unknown } | undefined;
  for (let depth = 0; cur && depth < 4; depth++) {
    const code = cur.code ? ` [${cur.code}]` : '';
    parts.push(`${cur.name ?? 'Error'}: ${cur.message ?? String(cur)}${code}`);
    cur = cur.cause as typeof cur;
  }
  return parts.join(' ← ') || String(e);
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function politeFetch(
  url: string,
  opts: RequestInit = {},
  retries = 2,
  delay: { min: number; max: number } = { min: 1500, max: 4000 }, // widened from 0.8–2 s
): Promise<Response> {
  const jitter = delay.min + Math.random() * (delay.max - delay.min);
  await sleep(jitter);

  // Fuller, internally-consistent browser fingerprint (UA + matching client
  // hints) so a bare request looks less like a bot.
  const headers = {
    'User-Agent': UA,
    'Accept': 'application/json, text/html, */*',
    'Accept-Language': 'en-ZA,en;q=0.9',
    'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Upgrade-Insecure-Requests': '1',
    ...opts.headers,
  };

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // proxyFetch routes www.autotrader.co.za through the residential proxy
      // (no-op direct fetch unless PROXY_* env is set).
      const res = await proxyFetch(url, { ...opts, headers });
      if (res.ok) return res;
      if (res.status === 404) return res; // caller decides
      // Rate-limit / WAF block: do NOT retry into the wall — signal abort.
      if (res.status === 429 || res.status === 503) throw new RateLimitError(url, res.status);
      // Other transient server errors (500/502/504): back off and retry.
      if (res.status >= 500) { await sleep(5000 * (attempt + 1)); continue; }
      return res;
    } catch (e) {
      if (e instanceof RateLimitError) throw e; // never retry a block
      lastErr = e;
      await sleep(3000 * (attempt + 1));
    }
  }
  throw lastErr ?? new Error(`fetch failed: ${url}`);
}
