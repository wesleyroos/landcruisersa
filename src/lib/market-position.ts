import { db } from '@/db/index';
import { listings, priceEvents } from '@/db/schema';
import { and, eq, gt, gte, ne, asc, inArray } from 'drizzle-orm';
import { modelLabel } from '@/lib/sources/normalize';

// Cohort statistics for a (model, year) — the comparison AutoTrader can't make,
// since they only see their own listings. Shared by the listing-page "market
// position" badge AND the public valuation tool, so both read one query path.

export interface CohortStats {
  cohortLabel: string;        // e.g. "2022–2024 79 Series"
  cohortSize: number;
  span: 1 | 2 | 3;            // year window actually used
  medianPrice: number;        // median asking of the cohort
  p25: number;
  p75: number;
  p90: number;                // for the asking-ceiling clamp
  minPrice: number;
  maxPrice: number;
  avgMileage: number | null;  // raw cohort avg of km>0 (null if none); caller decides usability
  kmCompCount: number;        // comps with km>0
  modelSupply: number;        // active same-model listings across all platforms
  anchorBasis: 'delisted' | 'active';
  cohortMinYear: number;
}

interface CohortOpts {
  excludeId?: number;
  includeNew?: boolean;     // include New listings (getMarketPosition parity); default false
  // Anchor on recently-delisted comps first. OFF in v1: the delisted pool is too
  // thin (~36 comps) to anchor reliably — it widens to ±3 years and produces
  // skewed cohorts (validated: it doubled incoherent results with no in-band
  // gain). Re-enable in phase 2 once the pool densifies, with a tight span cap.
  preferDelisted?: boolean; // default false
  trim?: boolean;           // drop price outliers (IQR fence); default true
  delistedMonths?: number;  // delisted-pool lookback; default 6
  // Comps to seek before the year window stops widening. The valuation engine
  // uses 10 so a thin (e.g. 5-comp) cohort doesn't land on a noisy median that
  // makes an older year value higher than a newer one. Default 5 preserves the
  // legacy getMarketPosition behaviour exactly.
  target?: number;          // default 5
  // Optional title predicate to scope the cohort to a spec (trim/engine/body).
  // Applied to the pool before the year window widens. Omitted = whole model.
  match?: (title: string) => boolean;
}

type CohortRow = { price: number; mileage: number; year: number; title: string };

function pctl(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// Drop egregious price outliers (1.5×IQR fence) so a mis-segmented or typo'd
// listing (e.g. a R2.8m "79-series") can't poison the median/percentiles.
// Keep ≥5 comps or fall back to the untrimmed set.
function priceTrim(rows: CohortRow[]): CohortRow[] {
  if (rows.length < 5) return rows;
  const ps = rows.map(r => r.price).sort((a, b) => a - b);
  const q1 = pctl(ps, 0.25), q3 = pctl(ps, 0.75), iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
  const t = rows.filter(r => r.price >= lo && r.price <= hi);
  return t.length >= 5 ? t : rows;
}

// Widen the year window (±1 → ±2 → ±3) until there are enough comparables to
// make an honest claim. Older vehicles are sparse in any single year. Prefer the
// tightest window that reaches `target` comps (keeps age-resolution where data
// is dense); if no window reaches it, fall back to the widest (±3) with the
// absolute minimum of 5 — more comps there means a more stable median.
function expand(pool: CohortRow[], year: number, target: number): { rows: CohortRow[]; span: 1 | 2 | 3 } | null {
  for (let span = 1; span <= 3; span++) {
    const rows = pool.filter(r => r.year >= year - span && r.year <= year + span);
    if (rows.length >= target) return { rows, span: span as 1 | 2 | 3 };
  }
  const rows = pool.filter(r => r.year >= year - 3 && r.year <= year + 3);
  return rows.length >= 5 ? { rows, span: 3 } : null;
}

// Active same-model supply across every platform (matches the legacy
// getMarketPosition count: active + same model, regardless of price/type).
export function getModelSupply(model: string): number {
  return db.select({ id: listings.id }).from(listings)
    .where(and(eq(listings.status, 'active'), eq(listings.model, model))).all().length;
}

export function getCohortStats(
  input: { model: string; year: number },
  opts: CohortOpts = {},
): CohortStats | null {
  const { excludeId, includeNew = false, preferDelisted = false, trim = true, delistedMonths = 6, target = 5, match } = opts;
  const { model, year } = input;
  const scope = (pool: CohortRow[]) => (match ? pool.filter(r => match(r.title)) : pool);

  let chosen: { rows: CohortRow[]; span: 1 | 2 | 3 } | null = null;
  let anchorBasis: 'delisted' | 'active' = 'active';

  // 1. Recently-delisted pool first — cars that actually cleared the market are
  //    the best transacted-price proxy we own (counters active-pool survivorship
  //    inversion: overpriced cars sit and stay; sold cars leave).
  if (preferDelisted) {
    const since = new Date(Date.now() - delistedMonths * 30 * 24 * 3600 * 1000);
    const conds = [
      inArray(listings.status, ['removed', 'sold']),
      eq(listings.listing_type, 'for_sale'),
      eq(listings.model, model),
      gt(listings.price, 0),
      gte(listings.off_market_at, since),
    ];
    if (!includeNew) conds.push(eq(listings.new_or_used, 'Used'));
    const pool = db.select({ price: listings.price, mileage: listings.mileage, year: listings.year, title: listings.title })
      .from(listings).where(and(...conds)).all();
    const d = expand(scope(pool), year, target);
    if (d) { chosen = d; anchorBasis = 'delisted'; }
  }

  // 2. Fall back to the live active pool.
  if (!chosen) {
    const conds = [
      eq(listings.status, 'active'),
      eq(listings.listing_type, 'for_sale'),
      eq(listings.model, model),
      gt(listings.price, 0),
    ];
    if (!includeNew) conds.push(eq(listings.new_or_used, 'Used'));
    if (excludeId != null) conds.push(ne(listings.id, excludeId));
    const pool = db.select({ price: listings.price, mileage: listings.mileage, year: listings.year, title: listings.title })
      .from(listings).where(and(...conds)).all();
    const a = expand(scope(pool), year, target);
    if (a) { chosen = a; anchorBasis = 'active'; }
  }

  if (!chosen) return null; // even ±3 too thin — no honest claim possible

  const rows = trim ? priceTrim(chosen.rows) : chosen.rows;
  const prices = rows.map(r => r.price).sort((a, b) => a - b);
  const kms = rows.map(r => r.mileage).filter(m => m > 0);

  return {
    cohortLabel: `${year - chosen.span}–${year + chosen.span} ${modelLabel(model)}`,
    cohortSize: rows.length,
    span: chosen.span,
    medianPrice: Math.round(pctl(prices, 0.5)),
    p25: Math.round(pctl(prices, 0.25)),
    p75: Math.round(pctl(prices, 0.75)),
    p90: Math.round(pctl(prices, 0.90)),
    minPrice: prices[0],
    maxPrice: prices[prices.length - 1],
    avgMileage: kms.length ? Math.round(kms.reduce((s, m) => s + m, 0) / kms.length) : null,
    kmCompCount: kms.length,
    modelSupply: getModelSupply(model),
    anchorBasis,
    cohortMinYear: Math.min(...rows.map(r => r.year)),
  };
}

// ── Listing-page "market position" badge ────────────────────────────────────
// Re-implemented on top of getCohortStats with flags that reproduce the legacy
// cohort exactly (active-only, includes New, no outlier trim, no delisted pool)
// so IG/listing callers see byte-for-byte the same numbers as before the refactor.

export interface MarketPosition {
  cohortLabel: string;
  cohortSize: number;
  medianPrice: number;
  priceDiff: number;        // listing price − cohort median; negative = below market
  // Cohort price spread for the listing-page gauge: track = min→max, shaded
  // band = p25–p75 (where the middle half of the market is priced).
  priceMin: number;
  priceP25: number;
  priceP75: number;
  priceMax: number;
  avgMileage: number | null;
  mileageDiff: number | null;
  modelSupply: number;      // active same-model listings across all platforms
  history: { old_price: number; new_price: number; at: Date }[]; // this listing's price changes
}

export function getMarketPosition(listing: {
  id: number; slug: string; model: string; year: number; price: number; mileage: number;
}): MarketPosition | null {
  if (listing.price <= 0) return null;

  const c = getCohortStats(
    { model: listing.model, year: listing.year },
    { excludeId: listing.id, includeNew: true, preferDelisted: false, trim: false },
  );
  if (!c) return null;

  // avgMileage guard preserved: only when the subject reports mileage AND the
  // cohort has ≥5 comps with km>0 (a presentation guard, not a cohort property).
  const avgMileage = listing.mileage > 0 && c.kmCompCount >= 5 ? c.avgMileage : null;

  const history = db.select({
    old_price: priceEvents.old_price,
    new_price: priceEvents.new_price,
    at: priceEvents.recorded_at,
  }).from(priceEvents)
    .where(eq(priceEvents.slug, listing.slug))
    .orderBy(asc(priceEvents.recorded_at))
    .all();

  return {
    cohortLabel: c.cohortLabel,
    cohortSize: c.cohortSize,
    medianPrice: c.medianPrice,
    priceDiff: listing.price - c.medianPrice,
    priceMin: c.minPrice,
    priceP25: c.p25,
    priceP75: c.p75,
    priceMax: c.maxPrice,
    avgMileage,
    mileageDiff: avgMileage !== null ? listing.mileage - avgMileage : null,
    modelSupply: c.modelSupply,
    history,
  };
}
