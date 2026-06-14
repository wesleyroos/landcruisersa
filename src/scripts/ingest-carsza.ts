import { CarsZaAdapter, discoverStats } from '../lib/sources/carsza.ts';
import { isSourceEnabled } from '../lib/sources/registry.ts';
import { reportRun } from '../lib/sources/report.ts';

const SITE_URL = process.env.SITE_URL ?? 'https://landcruisersa.fly.dev';
const TOKEN    = process.env.INGEST_TOKEN ?? '';

async function ingest() {
  if (!isSourceEnabled('carsza')) {
    console.log('[carsza] disabled — skipping');
    return;
  }
  if (!TOKEN) throw new Error('INGEST_TOKEN not set');

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

  // Liveness: the sweep above saw every live cars.co.za Land Cruiser, so any
  // active carsza listing NOT in this run has been delisted — mark it removed.
  // (The GH Actions poller can't do this; Cloudflare blocks datacenter IPs.)
  let removed = 0;
  try {
    const liveRes = await fetch(`${SITE_URL}/api/aggregated/live`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (liveRes.ok) {
      const live = await liveRes.json() as Array<{ source: string; source_id: string }>;
      const seen = new Set(refs.map(r => r.source_id));
      const gone = live.filter(l => l.source === 'carsza' && !seen.has(l.source_id));
      if (gone.length > 0) {
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
