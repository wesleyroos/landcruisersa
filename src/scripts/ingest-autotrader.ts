import { AutoTraderAdapter, discoverStats } from '../lib/sources/autotrader.ts';
import { isSourceEnabled } from '../lib/sources/registry.ts';
import { applyExtraSegments, isSourceScheduled } from '../lib/sources/extra-config.ts';
import { reportRun } from '../lib/sources/report.ts';
import { segmentForModel } from '../lib/sources/normalize.ts';
import { reconcileOffMarket, scrapedSegmentsFor } from '../lib/sources/reconcile.ts';

const SITE_URL = process.env.SITE_URL ?? 'https://landcruisersa.fly.dev';
const TOKEN = process.env.INGEST_TOKEN ?? '';
const RESEND_KEY = process.env.RESEND_API_KEY ?? '';
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL ?? '';
// This script is shared by the Jimny pass (SCRAPE_SEGMENT=jimny). Tag alerts so a
// Jimny issue isn't mistaken for the LC scraper being broken.
const ALERT_TAG = process.env.SCRAPE_SEGMENT === 'jimny' ? '[JimnySA]' : '[LCSA]';

async function sendAlert(subject: string, body: string) {
  if (!RESEND_KEY || !NOTIFY_EMAIL) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'noreply@landcruisersa.co.za',
      to: NOTIFY_EMAIL,
      subject,
      html: `<pre>${body}</pre>`,
    }),
  }).catch(() => {});
}

async function ingest() {
  if (!isSourceEnabled('autotrader')) {
    console.log('[autotrader] disabled — skipping');
    return;
  }
  if (!TOKEN) throw new Error('INGEST_TOKEN not set');
  if (!(await isSourceScheduled('autotrader'))) {
    console.log('[autotrader] paused via admin toggle — skipping');
    return;
  }

  const collectExtra = await applyExtraSegments('autotrader');
  console.log('[autotrader] discovering listings…');
  const refs = await AutoTraderAdapter.discover();
  console.log(`[autotrader] found ${refs.length} refs`);

  // Zero-result guard: if discover returns nothing, something is broken — abort
  if (refs.length === 0) {
    await sendAlert(
      `${ALERT_TAG} AutoTrader ingest: zero results (scraper may be broken)`,
      'AutoTrader discover() returned 0 results. The scraper may be blocked or the API changed.\n\nNo changes were made to the DB.',
    );
    await reportRun('autotrader', { found: 0, ok: false, note: 'discovery returned zero results' });
    process.exit(1);
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  // Survive a network blip on the upload to prod: one failed POST skips that
  // listing, not the whole run (a single UND_ERR_BODY_TIMEOUT once killed it at
  // 5,200/6,416). Abort cleanly if prod is genuinely unreachable.
  let consecNetFail = 0, aborted = false;
  const ABORT_CONSEC = 5;

  // Streamed to the admin "Run Ingest" progress bar (run-ingest.ts parses these).
  const progress = (done: number) =>
    console.log(`PROGRESS::${JSON.stringify({ phase: 'ingest', done, total: refs.length })}`);

  for (let idx = 0; idx < refs.length; idx++) {
    if (idx % 20 === 0) progress(idx);
    const ref = refs[idx];
    let listing = await AutoTraderAdapter.fetchListing(ref);

    if (!listing) {
      skipped++;
      continue;
    }

    // SSR tile only exposes extra images for premium listings; supplement via proxy
    // for the rest — but only for publicly-shown segments: land-cruiser and
    // other-4x4 (non-Toyota game viewers, public on /game-viewers/). Hilux/
    // Fortuner are being bulk-collected for data right now (not shown publicly),
    // so we skip the heavy per-listing proxy on them to spare prod.
    const seg = listing.segment ?? segmentForModel(listing.model);
    if (listing.photos.length < 2 && (seg === 'land-cruiser' || seg === 'other-4x4')) {
      try {
        const proxyRes = await fetch(`${SITE_URL}/api/proxy/images`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: ref.source_url }),
          signal: AbortSignal.timeout(20_000),
        });
        if (proxyRes.ok) {
          const { images } = await proxyRes.json() as { images?: string[] };
          if (images && images.length > 1) {
            listing = { ...listing, photos: images };
            console.log(`[autotrader] proxy fetched ${images.length} images for ${ref.source_id}`);
          }
        }
      } catch { /* proxy unavailable — continue with single image */ }
    }

    let result: { action?: string };
    try {
      const res = await fetch(`${SITE_URL}/api/ingest`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(listing),
      });
      if (!res.ok) {
        console.error(`[autotrader] ingest failed for ${ref.source_id}: ${res.status}`);
        skipped++;
        consecNetFail = 0; // got a response — network is up; per-listing issue (e.g. 400)
        continue;
      }
      result = await res.json() as { action?: string };
      consecNetFail = 0;
    } catch (err) {
      // Network-level error (timeout/connection) — fetch or body read throws.
      skipped++;
      if (++consecNetFail >= ABORT_CONSEC) {
        console.error(`[autotrader] ABORTING — ${consecNetFail} uploads failed in a row; prod unreachable (${String(err).slice(0, 80)}). Re-run when the network is back.`);
        aborted = true;
        break;
      }
      continue;
    }
    if (result.action === 'created') created++;
    else if (result.action === 'updated') updated++;
  }

  progress(refs.length);

  // Off-market reconciliation: full-catalogue crawl → reap in-scope listings not
  // seen this run. Dry-run until RECONCILE_OFFMARKET=1; guarded by aborted/capHit/
  // segment-scope/circuit-breaker (see reconcile.ts).
  const removed = await reconcileOffMarket({
    source: 'autotrader', refs, scrapedSegments: scrapedSegmentsFor(collectExtra),
    siteUrl: SITE_URL, token: TOKEN, aborted, capHit: discoverStats.capHit,
  });

  console.log(`[autotrader] done — created: ${created}, updated: ${updated}, skipped: ${skipped}, removed: ${removed}${aborted ? ' (ABORTED — partial, prod unreachable)' : ''}`);
  await reportRun('autotrader', {
    found: refs.length, created, updated, skipped, removed,
    ok: !aborted,
    note: aborted ? 'upload aborted — prod unreachable mid-run' : undefined,
    sourceTotal: discoverStats.sourceTotal, capHit: discoverStats.capHit,
  });
}

ingest().catch(async (err) => {
  console.error('[autotrader] fatal error:', err);
  await sendAlert(`${ALERT_TAG} AutoTrader ingest error`, String(err));
  await reportRun('autotrader', { ok: false, note: String(err).slice(0, 200) });
  process.exit(1);
});
