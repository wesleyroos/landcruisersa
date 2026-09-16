import { CarsZaAdapter, discoverStats } from '../lib/sources/carsza.ts';
import { isSourceEnabled } from '../lib/sources/registry.ts';
import { applyExtraSegments, isSourceScheduled } from '../lib/sources/extra-config.ts';
import { reportRun } from '../lib/sources/report.ts';
import { postListing } from '../lib/sources/targets.ts';
import { reconcileAllTargets } from '../lib/sources/reconcile.ts';

const TOKEN    = process.env.INGEST_TOKEN ?? '';

async function ingest() {
  if (!isSourceEnabled('carsza')) {
    console.log('[carsza] disabled — skipping');
    return;
  }
  if (!TOKEN) throw new Error('INGEST_TOKEN not set');
  if (!(await isSourceScheduled('carsza'))) {
    console.log('[carsza] paused via admin toggle — skipping');
    return;
  }

  const collectExtra = await applyExtraSegments('carsza');
  // Segments this run actually crawled. The liveness sweep below must only reap
  // within these — otherwise turning Hilux/Fortuner collection off makes the
  // sweep treat every un-crawled toyota-4x4 listing as "delisted" and mass-purge
  // it (this happened 2026-06-16: 3,631 listings wrongly removed in one run).
  const scrapedSegments = new Set(['land-cruiser', ...(collectExtra ? ['toyota-4x4', 'bakkie'] : [])]);
  console.log('[carsza] discovering listings (drives headed Chrome — local only)…');
  const refs = await CarsZaAdapter.discover();
  console.log(`[carsza] found ${refs.length} refs`);

  if (refs.length === 0) {
    console.error('[carsza] zero results — API or Cloudflare clearance may have changed');
    await reportRun('carsza', { found: 0, ok: false, note: 'discovery returned zero results' });
    process.exit(1);
  }

  let created = 0, updated = 0, skipped = 0;
  // Survive a transient network blip on upload: one failed POST should skip that
  // listing, not crash the whole run after minutes of Chrome scraping (this is
  // what failed 2026-06-18 — discovery found 5,092 then a single ETIMEDOUT to
  // prod killed the lot). But if uploads keep failing the server/network is down,
  // so abort cleanly (bylaw #3) rather than grind through thousands of timeouts.
  let consecFail = 0, aborted = false;
  const ABORT_CONSEC = 5;

  let processed = 0;
  for (const ref of refs) {
    // The upload phase is ~5,300 sequential POSTs (~25 min) — log progress so a
    // long quiet stretch in CI reads as "working", not "hung" (the silent
    // 2026-07-11/12 runs looked frozen and were in fact just mid-upload).
    if (++processed % 500 === 0) {
      console.log(`[carsza] uploading… ${processed}/${refs.length} (created ${created}, updated ${updated})`);
    }
    const listing = await CarsZaAdapter.fetchListing(ref);
    if (!listing) { skipped++; continue; }

    // Fan-out by segment (lib/sources/targets.ts) — see ingest-autotrader.
    // 30s timeout: a stuck connection must fail fast into the consecFail logic.
    const result = await postListing(listing, 30_000);
    if (result.networkError) {
      skipped++;
      if (++consecFail >= ABORT_CONSEC) {
        console.error(`[carsza] ABORTING — ${consecFail} uploads failed in a row; ${result.target} unreachable. Discovery was fine; re-run when the network is back.`);
        aborted = true;
        break;
      }
      continue;
    }
    consecFail = 0;
    if (!result.ok) {
      console.error(`[carsza] ingest failed for ${ref.source_id}: ${result.status} @${result.target}`);
      skipped++;
      continue;
    }
    if (result.action === 'created') created++;
    else if (result.action === 'updated') updated++;
    else skipped++;
  }

  // Liveness sweep, fan-out edition: this run saw every live cars.co.za listing
  // in the segments it crawled, so any active carsza row in THOSE segments not
  // seen here has been delisted. Runs against every target (LCSA + BakkiesSA),
  // each scoped to what it owns, with the shared guards (aborted/capHit/segment
  // scope/25% breaker) in reconcile.ts. carsza's sweep has always been live
  // (not dry-run), so it forces the live flag on for its own call.
  const prevFlag = process.env.RECONCILE_OFFMARKET;
  process.env.RECONCILE_OFFMARKET = '1';
  const removed = await reconcileAllTargets({
    source: 'carsza', refs, scrapedSegments, aborted, capHit: discoverStats.capHit,
  });
  if (prevFlag === undefined) delete process.env.RECONCILE_OFFMARKET; else process.env.RECONCILE_OFFMARKET = prevFlag;

  console.log(`[carsza] done — created: ${created}, updated: ${updated}, skipped: ${skipped}, removed: ${removed}${aborted ? ' (ABORTED — partial, prod unreachable)' : ''}`);
  await reportRun('carsza', {
    found: refs.length, created, updated, skipped, removed,
    ok: !aborted,
    note: aborted ? 'upload aborted — prod unreachable mid-run' : undefined,
    sourceTotal: discoverStats.sourceTotal, capHit: discoverStats.capHit,
  });
}

ingest().catch(async err => {
  console.error('[carsza] fatal:', err);
  await reportRun('carsza', { ok: false, note: String(err).slice(0, 200) });
  process.exit(1);
});
