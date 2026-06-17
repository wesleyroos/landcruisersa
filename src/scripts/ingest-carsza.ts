import { CarsZaAdapter, discoverStats } from '../lib/sources/carsza.ts';
import { isSourceEnabled } from '../lib/sources/registry.ts';
import { applyExtraSegments } from '../lib/sources/extra-config.ts';
import { reportRun } from '../lib/sources/report.ts';

const SITE_URL = process.env.SITE_URL ?? 'https://landcruisersa.fly.dev';
const TOKEN    = process.env.INGEST_TOKEN ?? '';

async function ingest() {
  if (!isSourceEnabled('carsza')) {
    console.log('[carsza] disabled — skipping');
    return;
  }
  if (!TOKEN) throw new Error('INGEST_TOKEN not set');

  const collectExtra = await applyExtraSegments('carsza');
  // Segments this run actually crawled. The liveness sweep below must only reap
  // within these — otherwise turning Hilux/Fortuner collection off makes the
  // sweep treat every un-crawled toyota-4x4 listing as "delisted" and mass-purge
  // it (this happened 2026-06-16: 3,631 listings wrongly removed in one run).
  const scrapedSegments = new Set(['land-cruiser', ...(collectExtra ? ['toyota-4x4'] : [])]);
  console.log('[carsza] discovering listings (drives headed Chrome — local only)…');
  const refs = await CarsZaAdapter.discover();
  console.log(`[carsza] found ${refs.length} refs`);

  if (refs.length === 0) {
    console.error('[carsza] zero results — API or Cloudflare clearance may have changed');
    await reportRun('carsza', { found: 0, ok: false, note: 'discovery returned zero results' });
    process.exit(1);
  }

  let created = 0, updated = 0, skipped = 0;

  for (const ref of refs) {
    const listing = await CarsZaAdapter.fetchListing(ref);
    if (!listing) { skipped++; continue; }

    const res = await fetch(`${SITE_URL}/api/ingest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(listing),
    });

    if (!res.ok) {
      console.error(`[carsza] ingest failed for ${ref.source_id}: ${res.status}`);
      skipped++;
      continue;
    }

    const result = await res.json() as { action?: string };
    if (result.action === 'created') created++;
    else if (result.action === 'updated') updated++;
    else skipped++;
  }

  // Liveness sweep: this run saw every live cars.co.za listing in the segments it
  // crawled, so any active carsza listing in THOSE segments not seen here has been
  // delisted — mark it removed. (The poller can't do this for carsza: Cloudflare
  // blocks datacenter IPs.) Two guards keep it from purging good data:
  //   1. Segment-scoped — only reap segments crawled this run (`scrapedSegments`),
  //      so toggling Hilux/Fortuner off never deletes the un-crawled segment.
  //   2. Circuit breaker — if an implausibly large share would be removed, skip
  //      the whole sweep and log it. That signals a partial scrape / block, not a
  //      real mass-delisting (a 6h window never delists a quarter of the market).
  const REAP_CAP_FRACTION = 0.25;
  let removed = 0;
  try {
    const liveRes = await fetch(`${SITE_URL}/api/aggregated/live`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (liveRes.ok) {
      const live = await liveRes.json() as Array<{ source: string; source_id: string; segment: string }>;
      const seen = new Set(refs.map(r => r.source_id));
      const inScope = live.filter(l => l.source === 'carsza' && scrapedSegments.has(l.segment));
      const gone = inScope.filter(l => !seen.has(l.source_id));
      if (gone.length > 0 && gone.length / inScope.length > REAP_CAP_FRACTION) {
        console.warn(`[carsza] liveness sweep SKIPPED — ${gone.length}/${inScope.length} (${Math.round(100 * gone.length / inScope.length)}%) in-scope listings would be removed; treating as a partial scrape/block, not a mass delisting`);
      } else if (gone.length > 0) {
        const statusRes = await fetch(`${SITE_URL}/api/aggregated/status`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            updates: gone.map(g => ({ source: g.source, source_id: g.source_id, status: 'removed' })),
          }),
        });
        if (statusRes.ok) removed = gone.length;
      }
    }
  } catch (err) {
    console.error('[carsza] liveness sweep failed:', err);
  }

  console.log(`[carsza] done — created: ${created}, updated: ${updated}, skipped: ${skipped}, removed: ${removed}`);
  await reportRun('carsza', { found: refs.length, created, updated, skipped, removed, sourceTotal: discoverStats.sourceTotal, capHit: discoverStats.capHit });
}

ingest().catch(async err => {
  console.error('[carsza] fatal:', err);
  await reportRun('carsza', { ok: false, note: String(err).slice(0, 200) });
  process.exit(1);
});
