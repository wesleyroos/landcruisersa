import { AutoTraderAdapter } from '../lib/sources/autotrader.ts';
import { WbcAdapter } from '../lib/sources/wbc.ts';
import { AdiosAdapter } from '../lib/sources/adios.ts';
import { WbbAdapter } from '../lib/sources/wbb.ts';
import { VcsaAdapter } from '../lib/sources/vcsa.ts';

// Liveness poll: re-checks each active aggregated listing's source URL and marks
// 404s as 'removed' (→ off_market_at). Runs per-site via env, exactly like ingest:
// the LC pass uses SITE_URL/INGEST_TOKEN; the Jimny pass uses JIMNY_* (set in the
// workflow), so the SAME script reconciles whichever site it's pointed at.
//
// Hardening (was failing 100% of runs): (1) each listing's check is error-isolated
// — a single ECONNRESET no longer aborts the whole run; a fetch failure is treated
// as 'unknown' (NEVER 'removed', so a network blip can't false-delist a live car).
// (2) Capped per run, oldest-polled first, so a ~12k catalogue is covered over
// several runs without blowing the Actions timeout; status is POSTed in batches so
// partial progress survives an early exit.

const SITE_URL = process.env.SITE_URL ?? 'https://landcruisersa.fly.dev';
const TOKEN = process.env.INGEST_TOKEN ?? '';
const RESEND_KEY = process.env.RESEND_API_KEY ?? '';
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL ?? '';
const LABEL = process.env.SCRAPE_SEGMENT === 'jimny' ? '[JimnySA]' : '[LCSA]';
const CAP = Number(process.env.POLL_CAP ?? 2500);   // max listings checked per run
const BATCH = 200;                                   // status updates POSTed per request

const ADAPTERS: Record<string, { isStillLive: typeof AutoTraderAdapter.isStillLive }> = {
  autotrader: AutoTraderAdapter,
  wbc: WbcAdapter,
  adios: AdiosAdapter,
  wbb: WbbAdapter,
  // VCSA keeps sold cars published as an archive, so the poll can't rely on a
  // 404 — the adapter reads their sold flag instead.
  vcsa: VcsaAdapter,
};

// AutoTrader can't be liveness-polled (anti-bot resets the re-fetch → the poll
// burned the whole window on it and timed out); it's reconciled at ingest instead.
// POLL_SKIP (comma list) drops sources from the poll without a code change.
for (const name of (process.env.POLL_SKIP ?? '').split(',').map(s => s.trim()).filter(Boolean)) {
  delete ADAPTERS[name];
}

type Update = { source: string; source_id: string; status: string };

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

async function postBatch(updates: Update[]): Promise<number> {
  if (!updates.length) return 0;
  const res = await fetch(`${SITE_URL}/api/aggregated/status`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates }),
  }).catch((e) => { console.error(`${LABEL} [poll] status POST threw:`, e?.message ?? e); return null; });
  if (!res || !res.ok) {
    console.error(`${LABEL} [poll] status POST failed: ${res ? res.status : 'no response'}`);
    return 0;
  }
  const data = await res.json() as { updated?: number };
  return data.updated ?? 0;
}

async function poll() {
  if (!TOKEN) throw new Error('INGEST_TOKEN not set');

  const res = await fetch(`${SITE_URL}/api/aggregated/live`, {
    headers: { 'Authorization': `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`/api/aggregated/live returned ${res.status}`);

  const liveListings = await res.json() as Array<{
    id: number; source: string; source_id: string; source_url: string;
    segment: string; last_polled_at: number | null;
  }>;

  if (liveListings.length === 0) { console.log(`${LABEL} [poll] nothing to poll`); return; }

  // Oldest-polled first (never-polled = null sorts first) so coverage rotates
  // across runs and the per-run CAP doesn't starve the same tail every time.
  liveListings.sort((a, b) => (a.last_polled_at ?? 0) - (b.last_polled_at ?? 0));
  const toCheck = liveListings.slice(0, CAP);
  console.log(`${LABEL} [poll] ${liveListings.length} active; checking ${toCheck.length} oldest-polled this run`);

  let pending: Update[] = [];
  let totalUpdated = 0, removedCount = 0, errorCount = 0, skipped = 0;
  const removedRefs: string[] = [];

  for (const listing of toCheck) {
    const adapter = ADAPTERS[listing.source];
    if (!adapter) { skipped++; continue; } // e.g. carsza is reconciled at ingest, not here

    let result: string;
    try {
      result = await adapter.isStillLive({
        source: listing.source, source_id: listing.source_id, source_url: listing.source_url,
      });
    } catch {
      // One bad fetch must NOT kill the run. Unknown ≠ removed: never delist on error.
      errorCount++;
      result = 'unknown';
    }

    pending.push({ source: listing.source, source_id: listing.source_id, status: result });
    if (result === 'removed') { removedCount++; removedRefs.push(`${listing.source}/${listing.source_id}`); }

    if (pending.length >= BATCH) { totalUpdated += await postBatch(pending); pending = []; }
  }
  if (pending.length) totalUpdated += await postBatch(pending);

  console.log(`${LABEL} [poll] done — checked ${toCheck.length}, updated ${totalUpdated}, removed ${removedCount}, fetch-errors ${errorCount}, skipped ${skipped}`);

  if (removedCount > 0) {
    await sendAlert(`${LABEL} ${removedCount} listing(s) marked as removed`, removedRefs.join('\n'));
  }
}

poll().catch(async (err) => {
  console.error(`${LABEL} [poll] fatal error:`, err);
  await sendAlert(`${LABEL} Liveness poll error`, String(err));
  process.exit(1);
});
