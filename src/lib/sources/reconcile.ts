// Ingest-time off-market reconciliation (the cars.co.za pattern, generalised).
//
// A full-catalogue crawl saw every live listing for a source in the segments it
// crawled this run, so any DB-active listing in THOSE segments not seen here has
// been delisted → mark it removed. This is how cars.co.za already works; AutoTrader
// and WBC can't be liveness-polled (anti-bot ECONNRESET), so they reconcile here.
//
// Guards (in order):
//   1. aborted        — never reconcile off a partial upload (`seen` is incomplete).
//   2. capHit         — never reconcile off an incomplete discovery (AutoTrader flags
//                       a model that captured <90% of its reported total).
//   3. segment-scope  — only reap segments crawled this run (the load-bearing guard;
//                       a mis-scope caused a 3,631-listing mass-purge on 2026-06-16).
//   4. circuit-breaker — if >25% of in-scope would be removed, skip + log: that's a
//                       partial scrape/block, not a real mass-delisting in one window.
//   5. DRY-RUN default — computes & logs what it WOULD remove but does NOT POST until
//                       RECONCILE_OFFMARKET=1 is set, so it can be rolled out safely.

const REAP_CAP_FRACTION = 0.25;

// The segments a run actually crawled — must match the source's searchUrls() scope.
// Jimny pass crawls only 'jimny'; LC pass crawls 'land-cruiser' + 'other-4x4' (the
// game-viewer keyword crawl is the sole feeder of other-4x4 and runs every LC pass)
// + 'toyota-4x4' when the Hilux/Fortuner toggle is on. Reaping outside this set
// would purge un-crawled rows.
export function scrapedSegmentsFor(collectExtra: boolean): Set<string> {
  return process.env.SCRAPE_SEGMENT === 'jimny'
    ? new Set(['jimny'])
    : new Set(['land-cruiser', 'other-4x4', ...(collectExtra ? ['toyota-4x4'] : [])]);
}

export async function reconcileOffMarket(opts: {
  source: string;
  refs: { source_id: string }[];
  scrapedSegments: Set<string>;
  siteUrl: string;
  token: string;
  aborted?: boolean;
  capHit?: boolean | null;
}): Promise<number> {
  const { source, refs, scrapedSegments, siteUrl, token } = opts;
  const dryRun = process.env.RECONCILE_OFFMARKET !== '1';
  const tag = dryRun ? 'DRY-RUN' : 'live';

  if (opts.aborted) { console.warn(`[${source}] off-market sweep SKIPPED — upload aborted (partial run)`); return 0; }
  if (opts.capHit)  { console.warn(`[${source}] off-market sweep SKIPPED — capHit (incomplete discovery)`); return 0; }

  try {
    const liveRes = await fetch(`${siteUrl}/api/aggregated/live`, { headers: { Authorization: `Bearer ${token}` } });
    if (!liveRes.ok) { console.warn(`[${source}] off-market sweep SKIPPED — /aggregated/live ${liveRes.status}`); return 0; }

    const live = await liveRes.json() as Array<{ source: string; source_id: string; segment: string }>;
    const seen = new Set(refs.map(r => r.source_id));
    const inScope = live.filter(l => l.source === source && scrapedSegments.has(l.segment));
    if (inScope.length === 0) { console.log(`[${source}] off-market sweep — nothing in scope`); return 0; }

    const gone = inScope.filter(l => !seen.has(l.source_id));
    const pct = Math.round(100 * gone.length / inScope.length);

    if (gone.length === 0) { console.log(`[${source}] off-market sweep — 0 of ${inScope.length} in-scope delisted`); return 0; }
    if (gone.length / inScope.length > REAP_CAP_FRACTION) {
      console.warn(`[${source}] off-market sweep SKIPPED (circuit-breaker) — ${gone.length}/${inScope.length} (${pct}%) would be removed; treating as a partial scrape/block, not a mass delisting`);
      return 0;
    }

    if (dryRun) {
      console.log(`[${source}] off-market sweep ${tag} — WOULD mark ${gone.length}/${inScope.length} (${pct}%) removed. Set RECONCILE_OFFMARKET=1 to enable.`);
      return 0;
    }

    const statusRes = await fetch(`${siteUrl}/api/aggregated/status`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates: gone.map(g => ({ source: g.source, source_id: g.source_id, status: 'removed' })) }),
    });
    if (!statusRes.ok) { console.warn(`[${source}] off-market sweep — status POST ${statusRes.status}`); return 0; }
    console.log(`[${source}] off-market sweep — marked ${gone.length} removed (${pct}% of ${inScope.length} in scope)`);
    return gone.length;
  } catch (err) {
    console.error(`[${source}] off-market sweep failed:`, String(err).slice(0, 140));
    return 0;
  }
}
