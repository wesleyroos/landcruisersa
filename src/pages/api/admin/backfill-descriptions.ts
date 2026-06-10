export const prerender = false;

import type { APIRoute } from 'astro';

function checkAdmin(cookies: { get(name: string): { value: string } | undefined }): boolean {
  const token = cookies.get('lcsa_admin')?.value;
  const secret = import.meta.env.ADMIN_SECRET ?? process.env.ADMIN_SECRET;
  return Boolean(token && secret && token === secret);
}

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Prod URL + token — always talk to prod so local runs fetch AT pages from a
// non-blocked IP and still write descriptions into the real database.
const SITE_URL = process.env.SITE_URL ?? import.meta.env.SITE_URL ?? 'https://landcruisersa.fly.dev';
const TOKEN    = process.env.INGEST_TOKEN ?? import.meta.env.INGEST_TOKEN ?? '';

async function fetchAtDetails(sourceUrl: string): Promise<{ description: string; colour: string }> {
  const res = await fetch(sourceUrl, {
    headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return { description: '', colour: '' };
  const html = await res.text();

  const decode = (s: string) =>
    s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
     .replace(/&#x([0-9A-Fa-f]+);/g, (_: string, h: string) => String.fromCodePoint(parseInt(h, 16))).trim();

  // AT splits description across multiple e-read-more-line spans; first 1-2 are often empty
  const spans = [...html.matchAll(/<span[^>]*e-read-more-line[^>]*>([\s\S]*?)<\/span>/g)];
  const description = spans.map(m => decode(m[1])).filter(Boolean).join('\n');

  const colourMatch = html.match(/Colou?r<\/span>\s*<span[^>]*>([^<]+)<\/span>/);
  const colour = colourMatch ? colourMatch[1].trim() : '';

  return { description, colour };
}

const CONCURRENCY = 4;

export const GET: APIRoute = async ({ cookies }) => {
  if (!checkAdmin(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      // Always fetch pending list from prod so local runs see the real AT listings
      let pending: { id: number; source_id: string; source_url: string; colour: string }[] = [];
      try {
        const r = await fetch(`${SITE_URL}/api/admin/listings-missing-descriptions`, {
          headers: { Authorization: `Bearer ${TOKEN}` },
        });
        const data = await r.json() as { listings: typeof pending };
        pending = data.listings ?? [];
      } catch (err) {
        send({ type: 'error', message: 'Failed to fetch pending listings from prod' });
        controller.close();
        return;
      }

      send({ type: 'start', total: pending.length });

      if (pending.length === 0) {
        send({ type: 'done', updated: 0, skipped: 0, failed: 0 });
        controller.close();
        return;
      }

      let updated = 0, skipped = 0, failed = 0;

      for (let i = 0; i < pending.length; i += CONCURRENCY) {
        const chunk = pending.slice(i, i + CONCURRENCY);

        await Promise.all(chunk.map(async listing => {
          if (!listing.source_url) { skipped++; return; }

          let description = '', colour = '';
          try {
            ({ description, colour } = await fetchAtDetails(listing.source_url));
          } catch {
            failed++;
            send({ type: 'progress', source_id: listing.source_id, ok: false, reason: 'fetch error' });
            return;
          }

          if (!description && !colour) {
            skipped++;
            send({ type: 'progress', source_id: listing.source_id, ok: false, reason: 'no data found' });
            return;
          }

          // Patch prod DB via API
          try {
            await fetch(`${SITE_URL}/api/admin/patch-listing`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ source_id: listing.source_id, description, colour }),
            });
            updated++;
            send({ type: 'progress', source_id: listing.source_id, ok: true });
          } catch {
            failed++;
            send({ type: 'progress', source_id: listing.source_id, ok: false, reason: 'patch failed' });
          }
        }));

        send({ type: 'batch', done: Math.min(i + CONCURRENCY, pending.length), total: pending.length, updated, skipped, failed });

        if (i + CONCURRENCY < pending.length) await new Promise(r => setTimeout(r, 800));
      }

      send({ type: 'done', updated, skipped, failed });
      try { (await import('fs')).writeFileSync('/tmp/lcsa-desc-backfill.log', new Date().toISOString()); } catch {}
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
