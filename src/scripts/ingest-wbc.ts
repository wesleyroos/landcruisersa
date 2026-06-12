import { WbcAdapter } from '../lib/sources/wbc.ts';
import { isSourceEnabled } from '../lib/sources/registry.ts';
import { reportRun } from '../lib/sources/report.ts';

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
  if (!isSourceEnabled('wbc')) {
    console.log('[wbc] disabled — skipping');
    return;
  }
  if (!TOKEN) throw new Error('INGEST_TOKEN not set');

  console.log('[wbc] discovering listings via search API…');
  const refs = await WbcAdapter.discover();
  console.log(`[wbc] found ${refs.length} Land Cruiser refs`);

  if (refs.length === 0) {
    await sendAlert(
      '[LCSA] WBC ingest: zero results (scraper may be broken)',
      'WeBuyCars discover() returned 0 Land Cruiser results. The sitemap or API may have changed.\n\nNo changes were made to the DB.',
    );
    await reportRun('wbc', { found: 0, ok: false, note: 'discovery returned zero results' });
    process.exit(1);
  }

  let created = 0, updated = 0, skipped = 0;

  for (const ref of refs) {
    console.log(`[wbc] fetching ${ref.source_id}…`);
    const listing = await WbcAdapter.fetchListing(ref);

    if (!listing) {
      skipped++;
      continue;
    }

    const res = await fetch(`${SITE_URL}/api/ingest`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(listing),
    });

    if (!res.ok) {
      console.error(`[wbc] ingest failed for ${ref.source_id}: ${res.status}`);
      skipped++;
      continue;
    }

    const result = await res.json() as { action?: string };
    if (result.action === 'created') created++;
    else if (result.action === 'updated') updated++;
  }

  console.log(`[wbc] done — created: ${created}, updated: ${updated}, skipped: ${skipped}`);
  await reportRun('wbc', { found: refs.length, created, updated, skipped });
}

ingest().catch(async (err) => {
  console.error('[wbc] fatal error:', err);
  await sendAlert('[LCSA] WBC ingest error', String(err));
  await reportRun('wbc', { ok: false, note: String(err).slice(0, 200) });
  process.exit(1);
});
