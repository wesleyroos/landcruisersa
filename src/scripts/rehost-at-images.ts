import { rehostAutotraderImages, r2Configured } from '../lib/sources/r2.ts';
import { reportRun } from '../lib/sources/report.ts';

// Copy AutoTrader-hosted listing images to our R2 bucket. AT's image CDN
// rate-limits hotlinks (~half of requests 503), so listings pointing straight at
// it show broken images. AT blocks datacenter IPs, so this runs LOCALLY
// (residential IP) — it reads the affected listings from PROD, downloads + uploads
// the images here, and patches PROD with the R2 URLs.
const SITE_URL = process.env.SITE_URL ?? 'https://landcruisersa.fly.dev';
const TOKEN    = process.env.INGEST_TOKEN ?? '';
const CONCURRENCY = 3;
// Time budget: the backlog after a heavy ingest day can take hours, and running
// past the GitHub job timeout gets the step KILLED mid-write (the whole run then
// shows "cancelled" — that was 2026-07-02). Stop cleanly instead; the remainder
// is picked up next run.
const MAX_MINUTES = parseInt(process.env.MAX_MINUTES ?? '45', 10);

async function run() {
  if (!TOKEN) throw new Error('INGEST_TOKEN not set');
  if (!r2Configured()) throw new Error('R2 not configured (R2_ENDPOINT / keys missing)');

  const listRes = await fetch(`${SITE_URL}/api/admin/listings-with-at-images`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!listRes.ok) throw new Error(`listings-with-at-images returned ${listRes.status}`);
  const { listings: all } = await listRes.json() as {
    listings: { source_id: string | null; photos: string }[];
  };
  // patch-listing matches on source_id, so rows without one can't be patched here.
  const targets = all.filter(t => t.source_id);
  const noSid = all.length - targets.length;

  console.log(`[at-image-rehost] ${targets.length} listings still hotlinking AutoTrader${noSid ? ` (skipping ${noSid} without source_id)` : ''}`);
  if (targets.length === 0) { await reportRun('at-image-rehost', { found: 0 }); return; }

  let updated = 0, skipped = 0, failed = 0, imgs = 0;
  const deadline = Date.now() + MAX_MINUTES * 60_000;
  let outOfTime = false;

  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    if (Date.now() > deadline) {
      outOfTime = true;
      console.log(`[at-image-rehost] ${MAX_MINUTES}min budget reached at ${i}/${targets.length} — stopping cleanly; remainder next run`);
      break;
    }
    await Promise.all(targets.slice(i, i + CONCURRENCY).map(async t => {
      let photos: string[];
      try { photos = JSON.parse(t.photos) ?? []; } catch { skipped++; return; }
      if (!photos.length) { skipped++; return; }

      const rehosted = await rehostAutotraderImages(photos);
      // Nothing changed (e.g. all downloads failed) → leave it for the next run.
      if (rehosted.every((u, idx) => u === photos[idx])) { skipped++; return; }
      imgs += rehosted.filter((u, idx) => u !== photos[idx]).length;

      try {
        const r = await fetch(`${SITE_URL}/api/admin/patch-listing`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ source_id: t.source_id, photos: rehosted }),
        });
        if (r.ok) updated++; else failed++;
      } catch { failed++; }
    }));
    console.log(`[at-image-rehost] ${Math.min(i + CONCURRENCY, targets.length)}/${targets.length} — ${updated} updated, ${imgs} images copied`);
  }

  console.log(`[at-image-rehost] done — updated: ${updated}, images: ${imgs}, skipped: ${skipped}, failed: ${failed}${outOfTime ? ' (time budget hit)' : ''}`);
  await reportRun('at-image-rehost', { found: targets.length, updated, skipped, note: outOfTime ? `stopped at ${MAX_MINUTES}min budget — remainder next run` : undefined });
}

run().catch(async err => {
  console.error('[at-image-rehost] fatal:', err);
  await reportRun('at-image-rehost', { ok: false, note: String(err).slice(0, 200) });
  process.exit(1);
});
