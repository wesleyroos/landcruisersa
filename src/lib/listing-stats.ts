import { db } from '@/db/index';
import { listings, viewEvents } from '@/db/schema';
import { sql, eq, and, isNotNull } from 'drizzle-orm';
import type { Listing } from '@/db/schema';

// Days-on-market + demand stats for the listing page's market-position card.
//
// ⚠️ Honesty rule: `created_at` is when WE first saw a listing, not when the
// dealer posted it. Listings swept up in a source's FIRST crawl were already
// on the market for an unknown time — their DOM is a floor, shown as "N+".

const DAY = 86_400_000;
const TTL = 10 * 60 * 1000;

// ── per-source first-ingest dates (backfill detection) ──
let sourceStart: Map<string, number> | null = null;
let sourceStartAt = 0;
function sourceStarts(): Map<string, number> {
  if (sourceStart && Date.now() - sourceStartAt < 6 * 60 * 60 * 1000) return sourceStart;
  const rows = db.select({
    source: listings.source,
    first: sql<number>`min(created_at)`,
  }).from(listings).groupBy(listings.source).all();
  sourceStart = new Map(rows.map(r => [r.source, r.first * 1000]));
  sourceStartAt = Date.now();
  return sourceStart;
}

const toMs = (v: Date | number) => (v instanceof Date ? v.getTime() : v * 1000);

export interface DomStat {
  days: number;
  floor: boolean;        // true = "N+" (listing predates our tracking of its source)
  ended: boolean;        // true = off-market; days is final
}

export function getDaysOnMarket(l: Listing): DomStat {
  const start = toMs(l.created_at);
  const end = l.off_market_at ? toMs(l.off_market_at) : Date.now();
  const days = Math.max(1, Math.round((end - start) / DAY));
  const srcStart = sourceStarts().get(l.source);
  // First-crawl backfill window: anything we ingested within 2 days of a
  // source's first-ever row was likely already listed before we arrived.
  const floor = l.source !== 'own' && srcStart != null && start - srcStart < 2 * DAY;
  return { days, floor, ended: Boolean(l.off_market_at) };
}

// ── model median DOM (completed listings, clean cohort only) ──
const domCache = new Map<string, { at: number; median: number | null }>();
export function getModelMedianDom(model: string, source_exclusions = true): number | null {
  const hit = domCache.get(model);
  if (hit && Date.now() - hit.at < TTL) return hit.median;

  const starts = sourceStarts();
  const rows = db.select({
    source: listings.source,
    created: sql<number>`created_at`,
    ended: sql<number>`off_market_at`,
  }).from(listings)
    .where(and(eq(listings.model, model), isNotNull(listings.off_market_at)))
    .all();

  const spans = rows
    .filter(r => {
      if (!source_exclusions) return true;
      const s = starts.get(r.source);
      return r.source === 'own' || s == null || r.created * 1000 - s >= 2 * DAY;
    })
    .map(r => Math.max(1, Math.round((r.ended - r.created) / 86_400)))
    .sort((a, b) => a - b);

  const median = spans.length >= 5 ? spans[Math.floor(spans.length / 2)] : null;
  domCache.set(model, { at: Date.now(), median });
  return median;
}

// ── demand: 30d views for a slug + percentile across all viewed listings ──
let viewDist: { at: number; counts: Map<string, number>; sorted: number[] } | null = null;
export function getDemand(slug: string): { views: number; topPct: number | null } {
  if (!viewDist || Date.now() - viewDist.at > TTL) {
    const rows = db.select({
      slug: viewEvents.listing_slug,
      n: sql<number>`cast(count(*) as int)`,
    }).from(viewEvents)
      .where(sql`created_at >= strftime('%s','now') - 30*86400`)
      .groupBy(viewEvents.listing_slug).all();
    viewDist = {
      at: Date.now(),
      counts: new Map(rows.map(r => [r.slug, r.n])),
      sorted: rows.map(r => r.n).sort((a, b) => a - b),
    };
  }
  const views = viewDist.counts.get(slug) ?? 0;
  if (views === 0 || viewDist.sorted.length < 20) return { views, topPct: null };
  const below = viewDist.sorted.filter(n => n < views).length;
  const pct = Math.max(1, Math.round(100 * (1 - below / viewDist.sorted.length)));
  return { views, topPct: pct <= 50 ? pct : null };
}
