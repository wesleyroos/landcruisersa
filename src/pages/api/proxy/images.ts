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

    // Description: seller-comment block in server-rendered HTML
    let description = '';
    let colour = '';
    const descMatch = html.match(/class="[^"]*seller-comment[^"]*"[^>]*>[\s\S]*?<span class="[^"]*e-read-more-line[^"]*">([\s\S]*?)<\/span>/);
    if (descMatch) {
      description = descMatch[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x[0-9A-Fa-f]+;/g, c => String.fromCodePoint(parseInt(c.slice(3, -1), 16))).trim();
    }
    // Colour: rendered as "Colour</span><span class="...">VALUE</span>"
    const colourMatch = html.match(/Colou?r<\/span>\s*<span[^>]*>([^<]+)<\/span>/);
    if (colourMatch) colour = colourMatch[1].trim();

    return new Response(JSON.stringify({ images: images.slice(0, 20), description, colour }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ images: [], description: '', colour: '' }), { status: 200 });
  }
};
