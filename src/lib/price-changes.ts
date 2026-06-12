import { db } from '@/db/index';
import { listings, priceEvents } from '@/db/schema';
import { gte, inArray } from 'drizzle-orm';

// Net price movement per listing over the window: earliest recorded old_price
// vs the listing's current price, so consecutive cuts read as one honest total.
// Returns slug → net change in rands (negative = drop).
export function getRecentPriceChanges(windowDays = 30): Map<string, number> {
  const windowStart = new Date(Date.now() - windowDays * 24 * 3600 * 1000);

  const events = db.select({
    slug:      priceEvents.slug,
    old_price: priceEvents.old_price,
  }).from(priceEvents)
    .where(gte(priceEvents.recorded_at, windowStart))
    .orderBy(priceEvents.recorded_at)
    .all();

  const earliestOld = new Map<string, number>();
  for (const e of events) if (!earliestOld.has(e.slug)) earliestOld.set(e.slug, e.old_price);

  const changes = new Map<string, number>();
  if (earliestOld.size === 0) return changes;

  const rows = db.select({ slug: listings.slug, price: listings.price })
    .from(listings)
    .where(inArray(listings.slug, [...earliestOld.keys()]))
    .all();

  for (const r of rows) {
    const old = earliestOld.get(r.slug)!;
    if (r.price > 0 && old > 0 && r.price !== old) changes.set(r.slug, r.price - old);
  }
  return changes;
}
