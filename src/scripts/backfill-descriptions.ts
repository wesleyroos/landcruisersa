const SITE_URL = process.env.SITE_URL ?? 'https://landcruisersa.co.za';
const TOKEN    = process.env.INGEST_TOKEN ?? '';

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const CONCURRENCY = 3;
const DELAY_MS    = 1_200;

if (!TOKEN) throw new Error('INGEST_TOKEN not set');

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

  const spans = [...html.matchAll(/<span[^>]*e-read-more-line[^>]*>([\s\S]*?)<\/span>/g)];
  const description = spans.map(m => decode(m[1])).filter(Boolean).join('\n');

  const colourMatch = html.match(/Colou?r<\/span>\s*<span[^>]*>([^<]+)<\/span>/);
  const colour = colourMatch ? colourMatch[1].trim() : '';

  return { description, colour };
}

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('[backfill] fetching listings missing descriptions…');

  const r = await fetch(`${SITE_URL}/api/admin/listings-missing-descriptions`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!r.ok) throw new Error(`Failed to fetch pending list: ${r.status}`);

  const { listings } = await r.json() as {
    listings: { id: number; source_id: string; source_url: string; colour: string }[];
  };

  console.log(`[backfill] ${listings.length} listings need descriptions`);
  if (listings.length === 0) return;

  let updated = 0, skipped = 0, failed = 0;

  for (let i = 0; i < listings.length; i += CONCURRENCY) {
    const chunk = listings.slice(i, i + CONCURRENCY);

    await Promise.all(chunk.map(async listing => {
      if (!listing.source_url) { skipped++; return; }

      let description = '', colour = '';
      try {
        ({ description, colour } = await fetchAtDetails(listing.source_url));
      } catch (err) {
        console.log(`  [skip] ${listing.source_id} — fetch error`);
        failed++;
        return;
      }

      if (!description && !colour) {
        console.log(`  [skip] ${listing.source_id} — no data found`);
        skipped++;
        return;
      }

      try {
        await fetch(`${SITE_URL}/api/admin/patch-listing`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ source_id: listing.source_id, description, colour }),
        });
        console.log(`  [ok]   ${listing.source_id}`);
        updated++;
      } catch {
        console.log(`  [fail] ${listing.source_id} — patch failed`);
        failed++;
      }
    }));

    if (i + CONCURRENCY < listings.length) await delay(DELAY_MS);
  }

  console.log(`[backfill] done — updated: ${updated}, skipped: ${skipped}, failed: ${failed}`);
}

run().catch(err => { console.error(err); process.exit(1); });
