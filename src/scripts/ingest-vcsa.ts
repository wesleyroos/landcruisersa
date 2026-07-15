import { VcsaAdapter, discoverStats } from '../lib/sources/vcsa.ts';
import { isSourceEnabled } from '../lib/sources/registry.ts';
import { isSourceScheduled } from '../lib/sources/extra-config.ts';
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
  if (!isSourceEnabled('vcsa')) {
    console.log('[vcsa] disabled — skipping');
    return;
  }
  if (!TOKEN) throw new Error('INGEST_TOKEN not set');
  if (!(await isSourceScheduled('vcsa'))) {
    console.log('[vcsa] paused via admin toggle — skipping');
    return;
  }

  console.log('[vcsa] discovering listings…');
  const refs = await VcsaAdapter.discover();
  console.log(`[vcsa] found ${refs.length} refs`);

  // Unlike the portals, zero here is NORMAL: VCSA is a classic-car dealer that
  // happens to stock a few Cruisers, and selling all of them is a real state.
  // So zero is not treated as a broken scraper — it must not alert or exit 1,
  // or the ingest workflow would go permanently red the day they sell out.
  if (refs.length === 0) {
    console.log('[vcsa] no live Land Cruisers in stock — nothing to ingest');
    await reportRun('vcsa', { found: 0, created: 0, updated: 0, skipped: 0, note: 'no live Land Cruisers in stock' });
    return;
  }

  let created = 0, updated = 0, skipped = 0;

  for (const ref of refs) {
    console.log(`[vcsa] fetching ${ref.source_id}…`);
    const listing = await VcsaAdapter.fetchListing(ref);

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
      console.error(`[vcsa] ingest failed for ${ref.source_id}: ${res.status}`);
      skipped++;
      continue;
    }

    const result = await res.json() as { action?: string };
    if (result.action === 'created') created++;
    else if (result.action === 'updated') updated++;
  }

  console.log(`[vcsa] done — created: ${created}, updated: ${updated}, skipped: ${skipped}`);
  await reportRun('vcsa', { found: refs.length, created, updated, skipped, sourceTotal: discoverStats.sourceTotal, capHit: discoverStats.capHit });
}

ingest().catch(async (err) => {
  console.error('[vcsa] fatal error:', err);
  await sendAlert('[LCSA] Vintage Cars SA ingest error', String(err));
  await reportRun('vcsa', { ok: false, note: String(err).slice(0, 200) });
  process.exit(1);
});
