export const prerender = false;

import type { APIRoute } from 'astro';

export const GET: APIRoute = () =>
  new Response(null, { status: 405, headers: { Allow: 'POST' } });

function checkToken(request: Request): boolean {
  const auth = request.headers.get('authorization') ?? '';
  const token = import.meta.env.INGEST_TOKEN ?? process.env.INGEST_TOKEN;
  if (!token) return false;
  return auth === `Bearer ${token}`;
}

export const POST: APIRoute = async ({ request }) => {
  if (!checkToken(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let url: string;
  try {
    const body = await request.json() as { url?: unknown };
    if (typeof body.url !== 'string' || !body.url.startsWith('https://www.autotrader.co.za/')) {
      return new Response(JSON.stringify({ error: 'Invalid url' }), { status: 400 });
    }
    url = body.url;
  } catch {
    return new Response(JSON.stringify({ error: 'Bad request' }), { status: 400 });
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-ZA,en;q=0.9',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ images: [], description: '', colour: '' }), { status: 200 });
    }

    const html = await res.text();

    // Images
    const seen = new Set<string>();
    const images: string[] = [];
    for (const m of html.matchAll(/https:\/\/img\.autotrader\.co\.za\/(\d+)/g)) {
      if (!seen.has(m[1])) { seen.add(m[1]); images.push(m[0]); }
    }

    // Description + colour from __NEXT_DATA__ JSON blob
    let description = '';
    let colour = '';
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextDataMatch) {
      try {
        const json = JSON.parse(nextDataMatch[1]);
        const props = json?.props?.pageProps ?? {};
        const ad = props.advert ?? props.listing ?? props.vehicle ?? props.data?.advert ?? {};
        description = ad.sellerComment ?? ad.description ?? ad.comments ?? ad.dealerComment ?? '';
        colour = ad.colour ?? ad.color ?? ad.exteriorColour ?? '';
        // Fallback: walk props looking for sellerComment anywhere
        if (!description) {
          const str = nextDataMatch[1];
          const m = str.match(/"sellerComment"\s*:\s*"((?:[^"\\]|\\.)*)"/);
          if (m) description = m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        }
        if (!colour) {
          const str = nextDataMatch[1];
          const m = str.match(/"colour"\s*:\s*"([^"]+)"/);
          if (m) colour = m[1];
        }
      } catch { /* malformed JSON — skip */ }
    }

    return new Response(JSON.stringify({ images: images.slice(0, 20), description, colour }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ images: [], description: '', colour: '' }), { status: 200 });
  }
};
