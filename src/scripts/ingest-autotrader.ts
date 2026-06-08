import { AutoTraderAdapter } from '../lib/sources/autotrader.ts';
import { isSourceEnabled } from '../lib/sources/registry.ts';

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
    process.exit(1);
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const ref of refs) {
    console.log(`[autotrader] fetching ${ref.source_id}…`);
    const listing = await AutoTraderAdapter.fetchListing(ref);

    if (!listing) {
      skipped++;
      continue;
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

  console.log(`[autotrader] done — created: ${created}, updated: ${updated}, skipped: ${skipped}`);
}

ingest().catch(async (err) => {
  console.error('[autotrader] fatal error:', err);
  await sendAlert('[LCSA] AutoTrader ingest error', String(err));
  process.exit(1);
});
