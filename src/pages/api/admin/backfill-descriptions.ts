export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { listings } from '@/db/schema';
import { eq, and, or, isNull, sql } from 'drizzle-orm';

function checkAdmin(cookies: { get(name: string): { value: string } | undefined }): boolean {
  const token = cookies.get('lcsa_admin')?.value;
  const secret = import.meta.env.ADMIN_SECRET ?? process.env.ADMIN_SECRET;
  return Boolean(token && secret && token === secret);
}

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function fetchAtDetails(sourceUrl: string): Promise<{ description: string; colour: string }> {
  const res = await fetch(sourceUrl, {
    headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return { description: '', colour: '' };
  const html = await res.text();

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
      if (!description) {
        const m = nextDataMatch[1].match(/"sellerComment"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (m) description = m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      }
      if (!colour) {
        const m = nextDataMatch[1].match(/"colour"\s*:\s*"([^"]+)"/);
        if (m) colour = m[1];
      }
    } catch { /* malformed JSON */ }
  }

  return { description: description.trim(), colour: colour.trim() };
}

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

export const GET: APIRoute = async ({ cookies }) => {
  if (!checkAdmin(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      const pending = db
        .select({ id: listings.id, source_id: listings.source_id, source_url: listings.source_url, colour: listings.colour })
        .from(listings)
        .where(and(
          eq(listings.source, 'autotrader'),
          eq(listings.status, 'active'),
          or(
            isNull(listings.description),
            sql`trim(${listings.description}) = ''`,
          ),
        ))
        .limit(50)
        .all();

      send({ type: 'start', total: pending.length });

      if (pending.length === 0) {
        send({ type: 'done', updated: 0, skipped: 0, failed: 0 });
        controller.close();
        return;
      }

      let updated = 0, skipped = 0, failed = 0;

      for (const listing of pending) {
        if (!listing.source_url) { skipped++; continue; }

        let description = '';
        let colour = '';

        try {
          ({ description, colour } = await fetchAtDetails(listing.source_url));
        } catch {
          failed++;
          send({ type: 'progress', source_id: listing.source_id, ok: false, reason: 'fetch error' });
          await delay(1_000);
          continue;
        }

        if (!description && !colour) {
          skipped++;
          send({ type: 'progress', source_id: listing.source_id, ok: false, reason: 'no data found' });
          await delay(1_000);
          continue;
        }

        const patch: Record<string, string> = {};
        if (description) patch.description = description;
        if (colour && !listing.colour) patch.colour = colour;

        if (Object.keys(patch).length) {
          db.update(listings).set(patch).where(eq(listings.id, listing.id)).run();
          updated++;
          send({ type: 'progress', source_id: listing.source_id, ok: true, hasDesc: !!description, hasColour: !!colour });
        } else {
          skipped++;
          send({ type: 'progress', source_id: listing.source_id, ok: false, reason: 'already filled' });
        }

        await delay(1_000);
      }

      send({ type: 'done', updated, skipped, failed });
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
