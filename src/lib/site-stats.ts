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
