/**
 * Backfill AutoTrader listing images.
 *
 * Finds active AT listings stored in the DB with fewer than MIN_PHOTOS photos,
 * fetches the full image set from AutoTrader, and updates the DB.
 *
 * Designed to run anywhere — local Mac, VPS, wherever. Just needs:
 *   SITE_URL      Base URL of the Fly app  (default: https://landcruisersa.fly.dev)
 *   INGEST_TOKEN  Bearer token for the API
 *
 * Rate-limited to DELAY_MS between AT page fetches to avoid triggering blocks.
 * Processes BATCH_SIZE listings per run, so it's safe to run frequently via cron.
 */

const SITE_URL   = process.env.SITE_URL   ?? 'https://landcruisersa.fly.dev';
const TOKEN      = process.env.INGEST_TOKEN ?? '';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE ?? '30', 10);
const DELAY_MS   = parseInt(process.env.DELAY_MS   ?? '2000', 10); // ms between AT fetches
const MIN_PHOTOS = 2;

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

if (!TOKEN) {
  console.error('[at-images] INGEST_TOKEN not set — exiting');
  process.exit(1);
}

async function apiGet(path: string): Promise<unknown> {
  const res = await fetch(`${SITE_URL}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

async function fetchAtImages(sourceUrl: string): Promise<string[]> {
  const res = await fetch(sourceUrl, {
    headers: {
      'User-Agent': BROWSER_UA,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-ZA,en;q=0.9',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) return [];

  const html = await res.text();
  const seen  = new Set<string>();
  const imgs: string[] = [];
  for (const m of html.matchAll(/https:\/\/img\.autotrader\.co\.za\/(\d+)/g)) {
    if (!seen.has(m[1])) { seen.add(m[1]); imgs.push(m[0]); }
  }
  return imgs.slice(0, 20);
}

async function updatePhotos(source: string, source_id: string, photos: string[]): Promise<void> {
  const res = await fetch(`${SITE_URL}/api/aggregated/photos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, source_id, photos }),
  });
  if (!res.ok) throw new Error(`photos update failed for ${source_id}: ${res.status}`);
}

async function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log(`[at-images] starting — batch=${BATCH_SIZE}, delay=${DELAY_MS}ms`);

  const data = await apiGet(
    `/api/aggregated/needs-images?source=autotrader&min_photos=${MIN_PHOTOS}&limit=${BATCH_SIZE}`
  ) as { results: Array<{ source_id: string; source_url: string; photo_count: number }> };

  const pending = data.results;

  if (pending.length === 0) {
    console.log('[at-images] nothing to backfill — all listings have images');
    return;
  }

  console.log(`[at-images] ${pending.length} listings need images`);

  let updated = 0, failed = 0, empty = 0;

  for (const listing of pending) {
    process.stdout.write(`  ${listing.source_id} (${listing.photo_count} photos) → `);

    let imgs: string[] = [];
    try {
      imgs = await fetchAtImages(listing.source_url);
    } catch (err) {
      process.stdout.write(`fetch error: ${String(err).slice(0, 60)}\n`);
      failed++;
      await delay(DELAY_MS);
      continue;
    }

    if (imgs.length < MIN_PHOTOS) {
      process.stdout.write(`only ${imgs.length} found — skipping\n`);
      empty++;
      await delay(DELAY_MS);
      continue;
    }

    try {
      await updatePhotos('autotrader', listing.source_id, imgs);
      process.stdout.write(`✓ ${imgs.length} photos saved\n`);
      updated++;
    } catch (err) {
      process.stdout.write(`update error: ${String(err).slice(0, 60)}\n`);
      failed++;
    }

    await delay(DELAY_MS);
  }

  console.log(`[at-images] done — updated: ${updated}, empty: ${empty}, failed: ${failed}`);
}

run().catch(err => {
  console.error('[at-images] fatal:', err);
  process.exit(1);
});
