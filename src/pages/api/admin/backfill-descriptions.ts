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

  // Description: seller-comment block in server-rendered HTML
  let description = '';
  let colour = '';
  const descMatch = html.match(/class="[^"]*seller-comment[^"]*"[^>]*>[\s\S]*?<span class="[^"]*e-read-more-line[^"]*">([\s\S]*?)<\/span>/);
  if (descMatch) {
    description = descMatch[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x[0-9A-Fa-f]+;/g, (c: string) => String.fromCodePoint(parseInt(c.slice(3, -1), 16))).trim();
  }
  // Colour: rendered as "Colour</span><span class="...">VALUE</span>"
  const colourMatch = html.match(/Colou?r<\/span>\s*<span[^>]*>([^<]+)<\/span>/);
  if (colourMatch) colour = colourMatch[1].trim();

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
        .limit(600)
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
          await delay(600);
          continue;
        }

        if (!description && !colour) {
          skipped++;
          send({ type: 'progress', source_id: listing.source_id, ok: false, reason: 'no data found' });
          await delay(600);
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

        await delay(600);
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
