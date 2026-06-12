import { AdiosAdapter } from '../lib/sources/adios.ts';
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
  if (!isSourceEnabled('adios')) {
    console.log('[adios] disabled — skipping');
    return;
  }
  if (!TOKEN) throw new Error('INGEST_TOKEN not set');

  console.log('[adios] discovering listings…');
  const refs = await AdiosAdapter.discover();
  console.log(`[adios] found ${refs.length} refs`);

  if (refs.length === 0) {
    await sendAlert(
      '[LCSA] Adios ingest: zero results (scraper may be broken)',
      'Adios discover() returned 0 results. The API may have changed.\n\nNo changes were made to the DB.',
    );
    await reportRun('adios', { found: 0, ok: false, note: 'discovery returned zero results' });
    process.exit(1);
  }

  let created = 0, updated = 0, skipped = 0;

  for (const ref of refs) {
    console.log(`[adios] fetching ${ref.source_id}…`);
    const listing = await AdiosAdapter.fetchListing(ref);

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
      console.error(`[adios] ingest failed for ${ref.source_id}: ${res.status}`);
      skipped++;
      continue;
    }

    const result = await res.json() as { action?: string };
    if (result.action === 'created') created++;
    else if (result.action === 'updated') updated++;
  }

  console.log(`[adios] done — created: ${created}, updated: ${updated}, skipped: ${skipped}`);
  await reportRun('adios', { found: refs.length, created, updated, skipped });
}

ingest().catch(async (err) => {
  console.error('[adios] fatal error:', err);
  await sendAlert('[LCSA] Adios ingest error', String(err));
  await reportRun('adios', { ok: false, note: String(err).slice(0, 200) });
  process.exit(1);
});
