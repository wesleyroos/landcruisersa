export const prerender = false;

import type { APIRoute } from 'astro';

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
      return new Response(JSON.stringify({ images: [] }), { status: 200 });
    }

    const html = await res.text();
    const seen = new Set<string>();
    const images: string[] = [];
    for (const m of html.matchAll(/https:\/\/img\.autotrader\.co\.za\/(\d+)/g)) {
      if (!seen.has(m[1])) {
        seen.add(m[1]);
        images.push(m[0]);
      }
    }

    return new Response(JSON.stringify({ images: images.slice(0, 20) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ images: [] }), { status: 200 });
  }
};
