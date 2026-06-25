import { WbbAdapter, discoverStats } from '../lib/sources/wbb.ts';
import { isSourceEnabled } from '../lib/sources/registry.ts';
import { applyExtraSegments, isSourceScheduled } from '../lib/sources/extra-config.ts';
import { reportRun } from '../lib/sources/report.ts';

const SITE_URL = process.env.SITE_URL ?? 'https://landcruisersa.fly.dev';
const TOKEN    = process.env.INGEST_TOKEN ?? '';

async function ingest() {
  if (!isSourceEnabled('wbb')) { console.log('[wbb] disabled — skipping'); return; }
  if (!TOKEN) throw new Error('INGEST_TOKEN not set');
  if (!(await isSourceScheduled('wbb'))) { console.log('[wbb] paused via admin toggle — skipping'); return; }

  await applyExtraSegments('wbb');
  console.log('[wbb] discovering listings…');
  const refs = await WbbAdapter.discover();
  console.log(`[wbb] found ${refs.length} refs`);

  if (refs.length === 0) {
    console.error('[wbb] zero results — sitemap may have changed');
    await reportRun('wbb', { found: 0, ok: false, note: 'discovery returned zero results' });
    process.exit(1);
  }

  let created = 0, updated = 0, skipped = 0;

  for (const ref of refs) {
    console.log(`[wbb] fetching ${ref.source_id}…`);
    const listing = await WbbAdapter.fetchListing(ref);
    if (!listing) { skipped++; continue; }

    const res = await fetch(`${SITE_URL}/api/ingest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(listing),
    });

    if (!res.ok) {
      console.error(`[wbb] ingest failed for ${ref.source_id}: ${res.status}`);
      skipped++;
      continue;
    }

    const result = await res.json() as { action?: string };
    if (result.action === 'created') created++;
    else if (result.action === 'updated') updated++;
  }

  console.log(`[wbb] done — created: ${created}, updated: ${updated}, skipped: ${skipped}`);
  await reportRun('wbb', { found: refs.length, created, updated, skipped, sourceTotal: discoverStats.sourceTotal, capHit: discoverStats.capHit });
}

ingest().catch(async err => {
  console.error('[wbb] fatal:', err);
  await reportRun('wbb', { ok: false, note: String(err).slice(0, 200) });
  process.exit(1);
});
