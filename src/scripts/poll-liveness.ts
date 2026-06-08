import { AutoTraderAdapter } from '../lib/sources/autotrader.ts';

const SITE_URL = process.env.SITE_URL ?? 'https://landcruisersa.fly.dev';
const TOKEN = process.env.INGEST_TOKEN ?? '';
const RESEND_KEY = process.env.RESEND_API_KEY ?? '';
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL ?? '';

const ADAPTERS: Record<string, { isStillLive: typeof AutoTraderAdapter.isStillLive }> = {
  autotrader: AutoTraderAdapter,
};

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

async function poll() {
  if (!TOKEN) throw new Error('INGEST_TOKEN not set');

  // Fetch all active aggregated listings
  const res = await fetch(`${SITE_URL}/api/aggregated/live`, {
    headers: { 'Authorization': `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`/api/aggregated/live returned ${res.status}`);

  const liveListings = await res.json() as Array<{
    id: number;
    source: string;
    source_id: string;
    source_url: string;
    last_polled_at: number | null;
  }>;

  console.log(`[poll] ${liveListings.length} active aggregated listings to check`);

  if (liveListings.length === 0) {
    console.log('[poll] nothing to poll');
    return;
  }

  const updates: Array<{ source: string; source_id: string; status: string }> = [];

  for (const listing of liveListings) {
    const adapter = ADAPTERS[listing.source];
    if (!adapter) {
      console.log(`[poll] no adapter for source: ${listing.source}`);
      continue;
    }

    console.log(`[poll] checking ${listing.source}/${listing.source_id}…`);
    const result = await adapter.isStillLive({
      source: listing.source,
      source_id: listing.source_id,
      source_url: listing.source_url,
    });

    updates.push({ source: listing.source, source_id: listing.source_id, status: result });
    if (result === 'removed') {
      console.log(`[poll] removed: ${listing.source}/${listing.source_id}`);
    }
  }

  // Batch update
  const statusRes = await fetch(`${SITE_URL}/api/aggregated/status`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ updates }),
  });

  if (!statusRes.ok) {
    throw new Error(`/api/aggregated/status returned ${statusRes.status}`);
  }

  const result = await statusRes.json() as { updated?: number };
  const removed = updates.filter(u => u.status === 'removed').length;
  console.log(`[poll] done — updated: ${result.updated}, removed: ${removed}`);

  if (removed > 0) {
    await sendAlert(
      `[LCSA] ${removed} listing(s) marked as removed`,
      updates
        .filter(u => u.status === 'removed')
        .map(u => `${u.source}/${u.source_id}`)
        .join('\n'),
    );
  }
}

poll().catch(async (err) => {
  console.error('[poll] fatal error:', err);
  await sendAlert('[LCSA] Liveness poll error', String(err));
  process.exit(1);
});
