import { AutoTraderAdapter, discoverStats } from '../lib/sources/autotrader.ts';
import { isSourceEnabled } from '../lib/sources/registry.ts';
import { reportRun } from '../lib/sources/report.ts';
import { segmentForModel } from '../lib/sources/normalize.ts';

const SITE_URL = process.env.SITE_URL ?? 'https://landcruisersa.fly.dev';
const TOKEN = process.env.INGEST_TOKEN ?? '';
const RESEND_KEY = process.env.RESEND_API_KEY ?? '';
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL ?? '';

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

  console.log('[autotrader] discovering listings…');
  const refs = await AutoTraderAdapter.discover();
  console.log(`[autotrader] found ${refs.length} refs`);

  // Zero-result guard: if discover returns nothing, something is broken — abort
  if (refs.length === 0) {
    await sendAlert(
      '[LCSA] AutoTrader ingest: zero results (scraper may be broken)',
      'AutoTrader discover() returned 0 results. The scraper may be blocked or the API changed.\n\nNo changes were made to the DB.',
    );
    await reportRun('autotrader', { found: 0, ok: false, note: 'discovery returned zero results' });
    process.exit(1);
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

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
    // for the rest — but only for the public LC segment. Hilux/Fortuner are being
    // bulk-collected for data right now (not shown publicly), so we skip the heavy
    // per-listing proxy on them to spare prod; backfill galleries when they go live.
    if (listing.photos.length < 2 && segmentForModel(listing.model) === 'land-cruiser') {
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
      continue;
    }

    const result = await res.json() as { action?: string };
    if (result.action === 'created') created++;
    else if (result.action === 'updated') updated++;
  }

  progress(refs.length);
  console.log(`[autotrader] done — created: ${created}, updated: ${updated}, skipped: ${skipped}`);
  await reportRun('autotrader', { found: refs.length, created, updated, skipped, sourceTotal: discoverStats.sourceTotal, capHit: discoverStats.capHit });
}

ingest().catch(async (err) => {
  console.error('[autotrader] fatal error:', err);
  await sendAlert('[LCSA] AutoTrader ingest error', String(err));
  await reportRun('autotrader', { ok: false, note: String(err).slice(0, 200) });
  process.exit(1);
});
