/**
 * Single source of truth for how a listing's status maps to the `off_market_at`
 * timestamp that powers the turnover / days-on-market insights.
 *
 * Stamp the timestamp the moment a listing leaves the market, clear it if it
 * comes back, and leave it untouched for any unrelated status write. Every
 * write path that can change a listing's status spreads `offMarketPatch(...)`
 * into its update so the column stays consistent no matter where the change
 * originates (admin UI, poller, ingest backfill).
 */

/** Statuses where a listing is no longer on the market. */
export const OFF_MARKET_STATUSES = ['sold', 'removed', 'inactive'] as const;
/** Statuses where a listing is (or is returning) on the market. */
export const ON_MARKET_STATUSES = ['active', 'pending'] as const;

/**
 * Returns the `off_market_at` patch for a status a listing is being set to:
 *   - off-market status  → stamp `now`
 *   - on-market status   → clear to null (handles re-activations cleanly)
 *   - anything else / undefined → no change (empty object)
 *
 * Spread the result into the `.set(...)` / updates object alongside the status.
 */
export function offMarketPatch(
  status: string | undefined,
  now: Date = new Date(),
): { off_market_at?: Date | null } {
  if (status === undefined) return {};
  if ((OFF_MARKET_STATUSES as readonly string[]).includes(status)) return { off_market_at: now };
  if ((ON_MARKET_STATUSES as readonly string[]).includes(status)) return { off_market_at: null };
  return {};
}
