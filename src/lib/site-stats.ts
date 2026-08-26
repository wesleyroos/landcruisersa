import { db } from '@/db/index';
import { listings } from '@/db/schema';
import { sql, eq, and, not, gt } from 'drizzle-orm';
import { LC_SEGMENT } from '@/lib/sources/normalize';

// Single source of truth for the headline counts quoted across the site
// (homepage hero, About, market data). Every public "live listings" / "models"
// figure must come from here so the numbers reconcile — three different counts
// on three pages is a credibility hole for an "authoritative" data source.
//
// Definitions (all scoped to the Land Cruiser segment — Hilux/Fortuner are
// collected for data but live behind segment = 'toyota-4x4' and are NOT counted
// in any public Land Cruiser headline):
//   liveListings — every active Land Cruiser listing. The canonical public
//                  "live listings" number.
//   models       — distinct Land Cruiser models on offer (excludes 'other').
//   forSale      — active Land Cruisers listed for sale with a published price.
//                  A subset of liveListings (excludes 'show_off' posts and
//                  listings with no price); it is the asking-price dataset the
//                  /market page reports on.

const LC = eq(listings.segment, LC_SEGMENT);
const ACTIVE_LC = and(eq(listings.status, 'active'), LC);

export interface SiteStats {
  liveListings: number;
  models: number;
  forSale: number;
}

export function getSiteStats(): SiteStats {
  const liveListings = (db.select({ n: sql<number>`cast(count(*) as int)` })
    .from(listings).where(ACTIVE_LC).get())?.n ?? 0;

  const models = (db.select({ n: sql<number>`cast(count(DISTINCT model) as int)` })
    .from(listings).where(and(ACTIVE_LC, not(eq(listings.model, 'other')))).get())?.n ?? 0;

  const forSale = (db.select({ n: sql<number>`cast(count(*) as int)` })
    .from(listings).where(and(ACTIVE_LC, eq(listings.listing_type, 'for_sale'), gt(listings.price, 0))).get())?.n ?? 0;

  return { liveListings, models, forSale };
}

// ── Market snapshot (for the /builds pages: "what a Cruiser like this costs") ──
// Ported from Jimny SA's Community Build Engine. Live for-sale asking prices
// for a model (or all Cruisers), summarised into the count + entry + typical
// range we quote next to a community build. A too-thin matched cohort
// transparently falls back to all Cruisers so the panel always shows real
// numbers, never an empty/misleading band.
const MODEL_LABELS: Record<string, string> = {
  '79-series': '79 Series', '76-series': '76 Series', '78-series': '78 Troopies',
  '70-series': '70 Series', '80-series': '80 Series', '100-series': '100 Series',
  '200-series': '200 Series', '300-series': '300 Series',
  'prado-90': 'Prado 90s', 'prado-120': 'Prado 120s', 'prado-150': 'Prado 150s',
  'prado-250': 'Prado 250s', 'fj-cruiser': 'FJ Cruisers',
  '40-series': '40 Series', '55-series': '55 Series', '60-series': '60 Series',
  'land-cruiser-fj': 'Land Cruiser FJs',
};
const MARKET_MIN_COHORT = 4; // below this, a "range" isn't meaningful → widen to all Cruisers

// A running Cruiser doesn't sell below this in SA — anything under it is
// salvage/spares/stripped or a mis-scraped price, excluded so the "from" figure
// (and thin-cohort stats) reflect the real market, not a data-error tail.
const MARKET_PRICE_FLOOR = 60_000;

export interface MarketSnapshot {
  model: string | null;   // the model actually summarised (after fallback), or null = all Cruisers
  label: string;          // "79 Series" | … | "Land Cruisers"
  matched: boolean;       // false if we fell back to all-Cruiser (cohort too thin)
  count: number;          // live for-sale count
  entry: number;          // p10 — realistic entry price ("from"), robust to the salvage tail
  median: number;         // p50 — the "typical" figure
  high: number;           // p75 — top of the "typical" band ("well-specced")
  browseHref: string;     // pre-filtered listings link
}

function pricesFor(model: string | null): number[] {
  const conds = [ACTIVE_LC, eq(listings.listing_type, 'for_sale'), gt(listings.price, MARKET_PRICE_FLOOR)];
  if (model) conds.push(eq(listings.model, model));
  return db.select({ price: listings.price }).from(listings)
    .where(and(...conds)).orderBy(listings.price).all()
    .map(r => r.price).filter((p): p is number => typeof p === 'number' && p > MARKET_PRICE_FLOOR);
}

const pctl = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];

export function getMarketSnapshot(model?: string | null): MarketSnapshot | null {
  const want = model && MODEL_LABELS[model] ? model : null;
  let used: string | null = want;
  let prices = want ? pricesFor(want) : pricesFor(null);
  let matched = !!want;

  // Thin matched cohort → fall back to all Cruisers (still real, just broader).
  if (want && prices.length < MARKET_MIN_COHORT) { used = null; prices = pricesFor(null); matched = false; }
  if (prices.length === 0) return null;

  return {
    model: used,
    label: used ? MODEL_LABELS[used] : 'Land Cruisers',
    matched,
    count: prices.length,
    entry: pctl(prices, 0.10),
    median: pctl(prices, 0.5),
    high: pctl(prices, 0.75),
    browseHref: used ? `/listings/?model=${used}` : '/listings/',
  };
}
