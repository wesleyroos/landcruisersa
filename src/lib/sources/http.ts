const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export async function politeFetch(
  url: string,
  opts: RequestInit = {},
  retries = 2,
  delay: { min: number; max: number } = { min: 800, max: 2000 },
): Promise<Response> {
  const jitter = delay.min + Math.random() * (delay.max - delay.min); // default 0.8–2 s
  await new Promise(r => setTimeout(r, jitter));

  const headers = {
    'User-Agent': UA,
    'Accept': 'application/json, text/html, */*',
    'Accept-Language': 'en-ZA,en;q=0.9',
    ...opts.headers,
  };

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...opts, headers });
      if (res.ok) return res;
      if (res.status === 404) return res; // caller decides
      if (res.status === 429 || res.status >= 500) {
        await new Promise(r => setTimeout(r, 5000 * (attempt + 1)));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
    }
  }
  throw lastErr ?? new Error(`fetch failed: ${url}`);
}
