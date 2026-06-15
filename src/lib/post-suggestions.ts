import { db } from '@/db/index';
import { listings, viewEvents } from '@/db/schema';
import { and, eq, gt, sql, isNull } from 'drizzle-orm';
import { getRecentPriceChanges } from './price-changes';
import { getMarketPosition } from './market-position';

// ─── "What should we post to IG today?" ──────────────────────────────────────
// Deterministic scoring over the signals that picked winners by hand:
//   demand   — model views + the listing's own views (last 7 days), log-damped
//   deal     — where the asking sits vs the cohort median, adjusted for mileage.
//              THIS is the substance: a price drop on a car that's still above
//              market is not a deal, and posting it as one burns credibility.
//   hook     — a recent price drop, but ONLY counted when the drop lands the car
//              at/below market (i.e. it actually became a good buy)
//   quality  — photo count, fresh listing, real description
//   rotation — penalise models we posted recently, so the mix keeps cycling
// Weights are intentionally simple and explainable; they get tuned over time
// against measured outcomes (clicks per posted segment).

export interface PostSuggestion {
  id: number;
  slug: string;
  title: string;
  model: string;
  price: number;
  province: string;
  photoCount: number;
  dropAmount: number;         // rands, 0 if none
  marketDiff: number | null;  // asking − cohort median; <0 = below market; null = cohort too thin
  dealScore: number | null;   // composite price+mileage deal score; >0 = good buy; null = unconfirmed
  score: number;
  reasons: string[];
}

// Mileage is weighted half of price in the deal score — price is the harder
// signal, mileage adjusts it (a car slightly over median but well under average
// km can still be the better buy; one at market with high km is not a deal).
const MILEAGE_WEIGHT = 0.5;

// Only the top-N candidates by cheap signals get the (more expensive) cohort
// lookup, so the daily cron and admin dashboard stay fast.
const MARKET_EVAL_CUT = 20;

const zar = (n: number) => 'R' + Math.round(n).toLocaleString('en-ZA');

export function getPostSuggestions(limit = 3): PostSuggestion[] {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  // Candidates: active, for sale, priced, decent photos, never posted to IG
  const candidates = db.select({
    id: listings.id,
    slug: listings.slug,
    title: listings.title,
    model: listings.model,
    price: listings.price,
    province: listings.province,
    year: listings.year,
    mileage: listings.mileage,
    created_at: listings.created_at,
    description: listings.description,
    photoCount: sql<number>`json_array_length(photos)`,
  }).from(listings)
    .where(and(
      eq(listings.status, 'active'),
      eq(listings.listing_type, 'for_sale'),
      gt(listings.price, 0),
      isNull(listings.ig_posted_at),
      sql`json_array_length(photos) >= 4`,
    ))
    .all();

  if (candidates.length === 0) return [];

  // Demand signals (7d)
  const modelViews = new Map(
    db.select({ model: viewEvents.model, n: sql<number>`count(*)` })
      .from(viewEvents)
      .where(and(gt(viewEvents.created_at, weekAgo), sql`model IS NOT NULL`))
      .groupBy(viewEvents.model).all()
      .map(r => [r.model!, r.n]),
  );
  const slugViews = new Map(
    db.select({ slug: viewEvents.listing_slug, n: sql<number>`count(*)` })
      .from(viewEvents)
      .where(gt(viewEvents.created_at, weekAgo))
      .groupBy(viewEvents.listing_slug).all()
      .map(r => [r.slug, r.n]),
  );

  // Price drops (net 30d)
  const changes = getRecentPriceChanges();

  // Rotation: the last 5 IG posts, most-recent first. Penalty is recency- and
  // frequency-weighted (see ROT_WEIGHTS) so a segment we keep posting drops out
  // of contention — this is what stops the suggestions homogenising into Prados.
  const recentlyPostedModels = db.select({ model: listings.model })
    .from(listings)
    .where(sql`ig_posted_at IS NOT NULL`)
    .orderBy(sql`ig_posted_at DESC`)
    .limit(5)
    .all()
    .map(r => r.model);
  const ROT_WEIGHTS = [22, 16, 11, 7, 4]; // index = how many posts ago

  const now = Date.now();

  // ── Pass 1: cheap signals only (no cohort lookup). Builds a base score and a
  // cut score (base + a provisional drop bump so droppers aren't filtered out
  // before we get to judge them against the market). ──
  const base = candidates.map(c => {
    let score = 0;
    const reasons: string[] = [];

    // Demand is log-damped: a hot listing still rises, but the segment with the
    // most stock (Prado) can't win on raw view volume alone.
    const mv = modelViews.get(c.model) ?? 0;
    if (mv > 0) { score += Math.round(Math.log2(1 + mv) * 6); reasons.push(`${c.model.replace(/-/g, ' ')} demand: ${mv} views this week`); }

    const sv = slugViews.get(c.slug) ?? 0;
    if (sv > 0) { score += Math.round(Math.log2(1 + sv) * 9); reasons.push(`listing itself viewed ${sv}× this week`); }

    if (c.photoCount >= 8) { score += 15; reasons.push(`${c.photoCount} photos`); }
    else if (c.photoCount >= 5) { score += 8; }

    const ageDays = (now - c.created_at.getTime()) / 86_400_000;
    if (ageDays <= 7) { score += 10; reasons.push('freshly listed'); }

    if ((c.description ?? '').length >= 200) score += 5;

    let rot = 0;
    recentlyPostedModels.forEach((m, i) => { if (m === c.model) rot += ROT_WEIGHTS[i] ?? 0; });
    if (rot > 0) {
      score -= rot;
      reasons.push(`recently posted ${c.model.replace(/-/g, ' ')} — rotation penalty −${rot}`);
    }

    const change = changes.get(c.slug) ?? 0;
    const dropAmount = change < 0 ? Math.abs(change) : 0;

    return { c, baseScore: score, dropAmount, reasons, cutScore: score + (dropAmount > 0 ? 25 : 0) };
  });

  const shortlist = base.sort((a, b) => b.cutScore - a.cutScore).slice(0, MARKET_EVAL_CUT);

  // ── Pass 2: market position (cohort median + mileage) for the shortlist. This
  // is where a drop becomes a real "deal" only if the car now sits at/below
  // market, and where above-market listings get pushed down. ──
  const evaluated: PostSuggestion[] = shortlist.map(({ c, baseScore, dropAmount, reasons }) => {
    let score = baseScore;
    const baseHook = dropAmount > 0 ? 25 + Math.min(40, dropAmount / 1000) : 0;

    const mp = getMarketPosition({
      id: c.id, slug: c.slug, model: c.model,
      year: c.year, price: c.price, mileage: c.mileage,
    });

    let marketDiff: number | null = null;
    let dealScore: number | null = null;

    if (mp) {
      marketDiff = mp.priceDiff;
      const pricePct = mp.priceDiff / mp.medianPrice;                           // <0 = cheaper than market
      const milePct = (mp.mileageDiff !== null && mp.avgMileage)
        ? mp.mileageDiff / mp.avgMileage : 0;                                    // <0 = fewer km than average
      dealScore = -(pricePct + MILEAGE_WEIGHT * milePct);                        // >0 = good buy

      // The deal itself — rewarded if below market, penalised if above. Capped
      // so it shapes the ranking without completely swamping demand/quality.
      score += Math.round(Math.max(-55, Math.min(55, dealScore * 120)));

      if (pricePct <= -0.03) reasons.push(`${zar(-mp.priceDiff)} below ${mp.cohortLabel} median (${mp.cohortSize} comps)`);
      else if (pricePct >= 0.03) reasons.push(`${zar(mp.priceDiff)} ABOVE ${mp.cohortLabel} median — not a deal`);
      else reasons.push(`priced at ${mp.cohortLabel} market`);

      if (mp.mileageDiff !== null && mp.avgMileage) {
        const mpct = Math.round((mp.mileageDiff / mp.avgMileage) * 100);
        if (mpct <= -8) reasons.push(`${Math.abs(mpct)}% below average km for the cohort`);
        else if (mpct >= 8) reasons.push(`${mpct}% above average km`);
      }

      // A drop is only a hook when it actually lands the car at/below fair value.
      if (dropAmount > 0) {
        if (dealScore >= 0) {
          score += baseHook;
          reasons.push(`price drop hook: ${zar(dropAmount)} off — now at/below market`);
        } else {
          reasons.push(`${zar(dropAmount)} drop, but still above market — no deal hook`);
        }
      }
    } else if (dropAmount > 0) {
      // Cohort too thin to judge honestly — allow a dampened drop hook, flagged.
      score += Math.round(baseHook * 0.4);
      reasons.push(`${zar(dropAmount)} price drop (market unconfirmed — sparse cohort)`);
    }

    return {
      id: c.id, slug: c.slug, title: c.title, model: c.model,
      price: c.price, province: c.province ?? '',
      photoCount: c.photoCount, dropAmount, marketDiff, dealScore,
      score: Math.round(score), reasons,
    };
  });

  return evaluated.sort((a, b) => b.score - a.score).slice(0, limit);
}
