import { db } from '@/db/index';
import { listings, priceEvents } from '@/db/schema';
import { and, eq, gt, gte, lte, ne, asc } from 'drizzle-orm';

// Market position of one listing vs its cohort (same model, year ±1) across
// EVERY platform we aggregate — the comparison AutoTrader can't make, since
// they only see their own listings.

export interface MarketPosition {
  cohortLabel: string;
  cohortSize: number;
  medianPrice: number;
  priceDiff: number;        // listing price − cohort median; negative = below market
  avgMileage: number | null;
  mileageDiff: number | null;
  modelSupply: number;      // active same-model listings across all platforms
  history: { old_price: number; new_price: number; at: Date }[]; // this listing's price changes
}

function median(sorted: number[]): number {
  const n = sorted.length;
  return n % 2 ? sorted[(n - 1) / 2] : Math.round((sorted[n / 2 - 1] + sorted[n / 2]) / 2);
}

export function getMarketPosition(listing: {
  id: number; slug: string; model: string; year: number; price: number; mileage: number;
}): MarketPosition | null {
  if (listing.price <= 0) return null;

  // Cohort: same model, year ±1, active and priced, excluding this listing
  const cohort = db.select({ price: listings.price, mileage: listings.mileage })
    .from(listings)
    .where(and(
      eq(listings.status, 'active'),
      eq(listings.listing_type, 'for_sale'),
      eq(listings.model, listing.model),
      gte(listings.year, listing.year - 1),
      lte(listings.year, listing.year + 1),
      gt(listings.price, 0),
      ne(listings.id, listing.id),
    ))
    .all();

  if (cohort.length < 5) return null; // too thin to make honest claims

  const prices = cohort.map(c => c.price).sort((a, b) => a - b);
  const medianPrice = median(prices);

  const mileages = cohort.map(c => c.mileage).filter(m => m > 0);
  const avgMileage = listing.mileage > 0 && mileages.length >= 5
    ? Math.round(mileages.reduce((s, m) => s + m, 0) / mileages.length)
    : null;

  const modelSupply = (db.select({ n: listings.id }).from(listings)
    .where(and(eq(listings.status, 'active'), eq(listings.model, listing.model))).all()).length;

  const history = db.select({
    old_price: priceEvents.old_price,
    new_price: priceEvents.new_price,
    at: priceEvents.recorded_at,
  }).from(priceEvents)
    .where(eq(priceEvents.slug, listing.slug))
    .orderBy(asc(priceEvents.recorded_at))
    .all();

  const yearLabel = `${listing.year - 1}–${listing.year + 1}`;
  const modelLabel = listing.model.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/Fj/, 'FJ');

  return {
    cohortLabel: `${yearLabel} ${modelLabel}`,
    cohortSize: cohort.length,
    medianPrice,
    priceDiff: listing.price - medianPrice,
    avgMileage,
    mileageDiff: avgMileage !== null ? listing.mileage - avgMileage : null,
    modelSupply,
    history,
  };
}
