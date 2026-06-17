import { fetchAtDetails } from '../lib/sources/at-details.ts';
import { reportRun } from '../lib/sources/report.ts';

// Fill missing AutoTrader descriptions. AT blocks datacenter IPs, so this runs
// locally (residential IP) after the local AT ingest — it reads the missing
// list from PROD, fetches each detail page here, and patches PROD.
const SITE_URL = process.env.SITE_URL ?? 'https://landcruisersa.fly.dev';
const TOKEN    = process.env.INGEST_TOKEN ?? '';
const CONCURRENCY = 4;

async function run() {
  if (!TOKEN) throw new Error('INGEST_TOKEN not set');

  const listRes = await fetch(`${SITE_URL}/api/admin/listings-missing-descriptions`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!listRes.ok) throw new Error(`listings-missing-descriptions returned ${listRes.status}`);
  const { listings: targets } = await listRes.json() as {
    listings: { source_id: string; source_url: string }[];
  };

  console.log(`[at-desc-backfill] ${targets.length} AT listings need descriptions`);
  if (targets.length === 0) { await reportRun('at-desc-backfill', { found: 0 }); return; }

  let updated = 0, skipped = 0, failed = 0;
  // Block-abort (constitution #3): if whole batches keep failing, AutoTrader is
  // blocking this IP — stop, don't grind every listing into the wall.
  let consecFailBatches = 0, aborted = false;
  const ABORT_BATCHES = 3; // ~12 consecutive failed fetches = a block, not bad luck

  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const u0 = updated, f0 = failed;
    await Promise.all(targets.slice(i, i + CONCURRENCY).map(async t => {
      if (!t.source_url) { skipped++; return; }
      let description = '', colour = '';
      try {
        ({ description, colour } = await fetchAtDetails(t.source_url));
      } catch { failed++; return; }
      if (!description && !colour) { skipped++; return; }
      try {
        const r = await fetch(`${SITE_URL}/api/admin/patch-listing`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ source_id: t.source_id, description, colour }),
        });
        if (r.ok) updated++; else failed++;
      } catch { failed++; }
    }));
    if (updated === u0 && failed > f0) {
      if (++consecFailBatches >= ABORT_BATCHES) {
        console.warn(`[at-desc-backfill] ABORTING — ${consecFailBatches} batches all failed; AutoTrader is likely blocking this IP. Backing off.`);
        aborted = true;
        break;
      }
    } else {
      consecFailBatches = 0;
    }
    await new Promise(r => setTimeout(r, 800)); // polite pacing between batches
  }

  console.log(`[at-desc-backfill] done — updated: ${updated}, skipped: ${skipped}, failed: ${failed}${aborted ? ' (ABORTED)' : ''}`);
  await reportRun('at-desc-backfill', {
    found: targets.length, updated, skipped,
    ok: !aborted,
    note: aborted ? 'rate-limited / block — aborted' : undefined,
  });
}

run().catch(async err => {
  console.error('[at-desc-backfill] fatal:', err);
  await reportRun('at-desc-backfill', { ok: false, note: String(err).slice(0, 200) });
  process.exit(1);
});
