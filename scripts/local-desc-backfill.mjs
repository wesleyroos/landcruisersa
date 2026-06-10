/**
 * Run locally — fetches AT listing detail pages (not blocked on local IPs)
 * and patches descriptions into the prod DB via the API.
 *
 * Usage:
 *   SITE_URL=https://landcruisersa.fly.dev INGEST_TOKEN=<token> node scripts/local-desc-backfill.mjs
 *
 * Or with a .env file loaded:
 *   node --env-file=.env scripts/local-desc-backfill.mjs
 */

const SITE_URL    = process.env.SITE_URL    ?? 'https://landcruisersa.fly.dev';
const TOKEN       = process.env.INGEST_TOKEN ?? '';
const BROWSER_UA  = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

if (!TOKEN) { console.error('INGEST_TOKEN not set'); process.exit(1); }

// ── 1. Fetch listings that need descriptions from prod ────────────────────────

const listingsRes = await fetch(`${SITE_URL}/api/admin/listings-missing-descriptions`, {
  headers: { Authorization: `Bearer ${TOKEN}` },
});

if (!listingsRes.ok) {
  console.error('Failed to fetch pending listings:', listingsRes.status, await listingsRes.text());
  process.exit(1);
}

const { listings } = await listingsRes.json();
console.log(`[desc-backfill] ${listings.length} listings need descriptions`);

if (!listings.length) process.exit(0);

// ── 2. For each listing, fetch AT page locally and extract description ─────────

const decode = s =>
  s.replace(/<[^>]+>/g, '')
   .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
   .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
   .trim();

let updated = 0, skipped = 0, failed = 0;

for (const listing of listings) {
  if (!listing.source_url) { skipped++; continue; }

  try {
    const res = await fetch(listing.source_url, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      console.warn(`[${listing.source_id}] AT returned ${res.status} — skipping`);
      skipped++;
      continue;
    }

    const html = await res.text();

    // Description: join all non-empty e-read-more-line spans
    const spans = [...html.matchAll(/<span[^>]*e-read-more-line[^>]*>([\s\S]*?)<\/span>/g)];
    const description = spans.map(m => decode(m[1])).filter(Boolean).join('\n');

    // Colour: from the specs table
    const colourMatch = html.match(/Colou?r<\/span>\s*<span[^>]*>([^<]+)<\/span>/);
    const colour = colourMatch ? colourMatch[1].trim() : '';

    if (!description && !colour) {
      console.warn(`[${listing.source_id}] no description or colour found — skipping`);
      skipped++;
      continue;
    }

    // ── 3. Patch prod DB via API ──────────────────────────────────────────────

    const patch = await fetch(`${SITE_URL}/api/admin/patch-listing`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_id: listing.source_id, description, colour }),
    });

    if (!patch.ok) {
      console.error(`[${listing.source_id}] patch failed:`, await patch.text());
      failed++;
    } else {
      console.log(`[${listing.source_id}] updated — desc: ${!!description}, colour: ${!!colour}`);
      updated++;
    }
  } catch (err) {
    console.error(`[${listing.source_id}] error:`, err.message);
    failed++;
  }

  await new Promise(r => setTimeout(r, 600));
}

console.log(`\n[desc-backfill] done — updated: ${updated}, skipped: ${skipped}, failed: ${failed}`);
