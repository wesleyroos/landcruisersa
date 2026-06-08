export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { listings } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';

function checkAdmin(request: Request): boolean {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.match(/lcsa_admin=([^;]+)/);
  const token = match?.[1];
  const secret = process.env.ADMIN_SECRET;
  return Boolean(token && secret && token === secret);
}

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function fetchAtImages(sourceUrl: string): Promise<string[]> {
  const res = await fetch(sourceUrl, {
    headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) return [];
  const html = await res.text();
  const seen = new Set<string>();
  const imgs: string[] = [];
  for (const m of html.matchAll(/https:\/\/img\.autotrader\.co\.za\/(\d+)/g)) {
    if (!seen.has(m[1])) { seen.add(m[1]); imgs.push(m[0]); }
  }
  return imgs.slice(0, 20);
}

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// Streams progress as Server-Sent Events so the connection stays alive past
// Fly's 15-second response-header timeout.
export const GET: APIRoute = async ({ request }) => {
  if (!checkAdmin(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      const pending = await db
        .select({ source_id: listings.source_id, source_url: listings.source_url })
        .from(listings)
        .where(and(
          eq(listings.status, 'active'),
          eq(listings.source, 'autotrader'),
          sql`json_array_length(${listings.photos}) < 2`,
        ))
        .limit(10);

      send({ type: 'start', total: pending.length });

      if (pending.length === 0) {
        send({ type: 'done', updated: 0, empty: 0, failed: 0 });
        controller.close();
        return;
      }

      let updated = 0, empty = 0, failed = 0;

      for (const listing of pending) {
        let imgs: string[] = [];
        try {
          imgs = await fetchAtImages(listing.source_url!);
        } catch {
          failed++;
          send({ type: 'progress', source_id: listing.source_id, ok: false, reason: 'fetch error' });
          await delay(1_500);
          continue;
        }

        if (imgs.length < 2) {
          empty++;
          send({ type: 'progress', source_id: listing.source_id, ok: false, reason: `${imgs.length} found` });
          await delay(1_500);
          continue;
        }

        await db
          .update(listings)
          .set({ photos: JSON.stringify(imgs) })
          .where(and(eq(listings.source, 'autotrader'), eq(listings.source_id, listing.source_id!)));

        updated++;
        send({ type: 'progress', source_id: listing.source_id, ok: true, photos: imgs.length });
        await delay(1_500);
      }

      send({ type: 'done', updated, empty, failed });
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
};
