import { db } from '@/db/index';
import { listings, viewEvents } from '@/db/schema';
import { and, eq, gt, sql, isNull } from 'drizzle-orm';
import { getRecentPriceChanges } from './price-changes';
import { getMarketPosition } from './market-position';
import { modelFamily, LC_SEGMENT } from './sources/normalize';
import { firstPhotoOrNull } from './photos';

// ─── "What should we post to IG today?" — Hero Engine (v2) ────────────────────
// See docs/ig-engine-v2-spec.md. The audience grows on aspirational hero builds
// (Jun 2026: the top 3 posts — all expensive kitted 79s — drove 130 of 160
// monthly follows), so HERO SCORE is the primary ranking:
//   mods     — distinct build categories detected in the description (winch,
//              bull bar, BP51, GTurbo, roof tent, …) — the "muscly build" signal
//   premium  — price ABOVE the cohort median, as an extras-value proxy. This is
//              v1's dealScore with the sign flipped: hero builds live above
//              market, and v1 punished them for it.
//   prior    — model-family prior (70-series builds dominate follows)
//   mint     — low km / recent year: showroom builds read aspirational
//   quality  — photo count, fresh listing; demand kept at half weight
//   rotation — family-level, softened (the data says 79s just win)
// v1's deal/drop logic survives intact but demoted to the DEAL and DROP slots —
// a hero-dominant weekly mix paced by getSlotPlan() over the ig_posts log.
// Weights are deterministic and explainable; tuned at the 2-weekly review
// against ig_post_metrics (real follows/reach, not site-click proxies).

export type IgSlot = 'hero' | 'deal' | 'drop' | 'cta';

export interface PostSuggestion {
  id: number;
  slug: string;
  title: string;
  model: string;
  price: number;
  province: string;
  photoCount: number;
  photo: string | null;       // first photo URL, for the suggestion thumbnail
  dropAmount: number;         // rands, 0 if none
  marketDiff: number | null;  // asking − cohort median; <0 = below market; null = cohort too thin
  dealScore: number | null;   // composite price+mileage deal score; >0 = good buy; null = unconfirmed
  heroScore: number;          // audience-growth ranking — the v2 primary
  modsDetected: string[];     // display names, one per build category hit
  slot: IgSlot;               // which slot this suggestion is ranked for
  score: number;              // the score used for THIS slot's ranking
  reasons: string[];
}

export interface SlotPlan {
  slot: IgSlot;
  reason: string;
}

export interface IgSuggestionSet {
  plan: SlotPlan;
  suggestions: PostSuggestion[];
}

// ── Mod lexicon — the "muscly build" detector ────────────────────────────────
// One display name per CATEGORY hit (first matching pattern wins), so a listing
// that says "winch" five times can't outscore a genuinely multi-category build.
// Extend at the tuning reviews as new brands/mods show up in listings.
const MOD_LEXICON: { cat: string; patterns: [RegExp, string][] }[] = [
  { cat: 'armour', patterns: [
    [/\bonca\b/i, 'Onca bumper'], [/bull\s?bar/i, 'bull bar'], [/\bLAS\b/, 'LAS bull bar'],
    [/rock\s?slider/i, 'rock sliders'], [/side\s?steps/i, 'side steps'],
    [/bash\s?plate|skid\s?plate/i, 'bash plates'], [/(replacement|rear|wrap[- ]?around).{0,12}bumper/i, 'replacement bumper'],
  ]},
  { cat: 'recovery', patterns: [
    [/\bwarn\b/i, 'Warn winch'], [/winch/i, 'winch'], [/recovery\s?point/i, 'recovery points'], [/maxtrax/i, 'Maxtrax'],
  ]},
  { cat: 'suspension', patterns: [
    [/bp[- ]?51/i, 'BP51 suspension'], [/old\s?man\s?emu|\bOME\b/i, 'Old Man Emu suspension'],
    [/king\s?shocks/i, 'King shocks'], [/tough\s?dog/i, 'Tough Dog suspension'],
    [/lift\s?kit/i, 'lift kit'], [/suspension\s?(upgrade|kit)/i, 'upgraded suspension'],
  ]},
  { cat: 'power', patterns: [
    [/g[- ]?turbo|gturbo|g380/i, 'GTurbo'], [/turbo\s?(upgrade|kit)|upgraded\s?turbo/i, 'turbo upgrade'],
    [/intercooler/i, 'intercooler'], [/\becu\b|custom\s?tune|dyno/i, 'ECU tune'],
    [/npc\s?clutch|billet\s?flywheel/i, 'NPC clutch'], [/(custom|performance|upgraded)\s?exhaust/i, 'performance exhaust'],
  ]},
  { cat: 'touring', patterns: [
    [/roof\s?(top\s?)?tent/i, 'rooftop tent'], [/alu[- ]?cab/i, 'Alu-Cab'], [/bushtech/i, 'Bushtech canopy'],
    [/\bRSI\b/, 'RSI canopy'], [/canopy/i, 'canopy'], [/drawer\s?(system|s)/i, 'drawer system'],
    [/long[- ]?range\s?tank/i, 'long-range tank'], [/dual\s?battery/i, 'dual battery'],
    [/solar/i, 'solar setup'], [/fridge/i, 'fridge slide'], [/awning/i, 'awning'], [/compressor/i, 'compressor'],
  ]},
  { cat: 'stance', patterns: [
    [/bf\s?goodrich|\bbfg\b/i, 'BFGoodrich tyres'], [/mud[- ]?terrain|all[- ]?terrain/i, 'off-road tyres'],
    [/\b33s?\b.{0,8}(tyre|inch)|\b35s?\b.{0,8}(tyre|inch)|\b(33|35)["”]/i, 'oversized tyres'],
    [/maxxis|cooper\s?(tyre|st)/i, 'off-road tyres'], [/(road\s?rage|upgraded|aftermarket)\s?(rims?|mags?|wheels)/i, 'aftermarket rims'],
  ]},
];

export function detectMods(text: string): string[] {
  const hits: string[] = [];
  for (const { patterns } of MOD_LEXICON) {
    for (const [re, label] of patterns) {
      if (re.test(text)) { hits.push(label); break; }
    }
  }
  return hits;
}

// Family prior — seeded from the Jun 2026 baseline (70-series builds took all
// three top-follow slots). Tunable map; retune against ig_post_metrics.
const FAMILY_PRIOR: Record<string, number> = {
  '70-series': 25,
  'main-line': 10,   // 100/200/300
  'fj':        10,
  'prado':      0,
};

// Deal-slot knobs (v1, unchanged): mileage adjusts price at half weight; only
// the top-N by cheap signals get the cohort lookup.
const MILEAGE_WEIGHT = 0.5;
const MARKET_EVAL_CUT = 20;

// A "genuine deal" worth a deal-slot day: ≥8% below market on the composite.
const DEAL_SLOT_MIN = 0.08;

// Rotation penalties by how many posts ago the same family was posted.
// Hero uses the softened set — optimising follows means not fighting the
// 79-dominance the data shows; deal/drop keep v1's stronger cycling.
const ROT_WEIGHTS_HERO = [11, 8, 6, 4, 2];
const ROT_WEIGHTS_DEAL = [22, 16, 11, 7, 4];

const zar = (n: number) => 'R' + Math.round(n).toLocaleString('en-ZA');
const firstPhoto = firstPhotoOrNull;

interface Evaluated {
  c: {
    id: number; slug: string; title: string; model: string; price: number;
    province: string | null; photoCount: number; photos: string;
  };
  dropAmount: number;
  marketDiff: number | null;
  dealScore: number | null;
  heroScore: number;
  dealSlotScore: number;      // v1-style score for the deal/drop rankings
  dropQualifies: boolean;     // drop landed the car at/below market (or sparse cohort)
  modsDetected: string[];
  heroReasons: string[];
  dealReasons: string[];
}

function evaluateCandidates(): Evaluated[] {
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
    mods: listings.mods,
    photos: listings.photos,
    photoCount: sql<number>`json_array_length(photos)`,
  }).from(listings)
    .where(and(
      eq(listings.status, 'active'),
      eq(listings.listing_type, 'for_sale'),
      gt(listings.price, 0),
      isNull(listings.ig_posted_at),
      sql`json_array_length(photos) >= 4`,
      eq(listings.segment, LC_SEGMENT),   // LC only — never suggest a Hilux/Fortuner for the LC IG
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

  // Rotation: last 5 IG posts, most-recent first, diversified at the FAMILY
  // level (posting one Prado suppresses all prado-* slugs).
  const recentlyPostedFamilies = db.select({ model: listings.model })
    .from(listings)
    .where(sql`ig_posted_at IS NOT NULL`)
    .orderBy(sql`ig_posted_at DESC`)
    .limit(5)
    .all()
    .map(r => modelFamily(r.model));

  const now = Date.now();
  const currentYear = new Date().getFullYear();

  // ── Pass 1: cheap signals only (no cohort lookup) ──
  const base = candidates.map(c => {
    const heroReasons: string[] = [];
    const dealReasons: string[] = [];
    let hero = 0;
    let deal = 0;

    // Mods — the muscly-build signal
    const modsDetected = detectMods(`${c.description ?? ''}\n${c.mods ?? ''}`);
    if (modsDetected.length > 0) {
      hero += Math.min(60, modsDetected.length * 12);
      heroReasons.push(`build: ${modsDetected.slice(0, 4).join(' · ')}${modsDetected.length > 4 ? ` +${modsDetected.length - 4}` : ''}`);
    }
    // Spec-sheet-style extras list (≥6 bullet lines)
    const bulletLines = (c.description ?? '').match(/^\s*(?:[-•*✅◦►]|\d+\.)\s/gm)?.length ?? 0;
    if (bulletLines >= 6) { hero += 8; heroReasons.push(`${bulletLines}-line extras list`); }

    // Family prior
    const candFamily = modelFamily(c.model);
    const prior = FAMILY_PRIOR[candFamily] ?? 0;
    if (prior > 0) hero += prior;

    // Mint condition
    if (c.mileage > 0 && c.mileage < 60_000) { hero += 15; heroReasons.push(`only ${c.mileage.toLocaleString('en-ZA')} km`); }
    if (c.year >= currentYear - 4) { hero += 10; }

    // Demand — log-damped; half weight for hero (follows ≠ site views)
    const mv = modelViews.get(c.model) ?? 0;
    const svN = slugViews.get(c.slug) ?? 0;
    const demand = (mv > 0 ? Math.round(Math.log2(1 + mv) * 6) : 0)
                 + (svN > 0 ? Math.round(Math.log2(1 + svN) * 9) : 0);
    hero += Math.round(demand * 0.5);
    deal += demand;
    if (mv > 0) dealReasons.push(`${c.model.replace(/-/g, ' ')} demand: ${mv} views this week`);
    if (svN > 0) dealReasons.push(`listing itself viewed ${svN}× this week`);

    // Photo quality + freshness (both rankings)
    let quality = 0;
    if (c.photoCount >= 8) { quality += 15; heroReasons.push(`${c.photoCount} photos`); }
    else if (c.photoCount >= 5) { quality += 8; }
    const ageDays = (now - c.created_at.getTime()) / 86_400_000;
    if (ageDays <= 7) { quality += 10; heroReasons.push('freshly listed'); }
    if ((c.description ?? '').length >= 200) quality += 5;
    hero += quality;
    deal += quality;

    // Rotation — softened for hero, v1 strength for deal
    let rotHero = 0, rotDeal = 0;
    recentlyPostedFamilies.forEach((f, i) => {
      if (f === candFamily) { rotHero += ROT_WEIGHTS_HERO[i] ?? 0; rotDeal += ROT_WEIGHTS_DEAL[i] ?? 0; }
    });
    hero -= rotHero;
    deal -= rotDeal;
    if (rotHero > 0) heroReasons.push(`recently posted ${candFamily.replace(/-/g, ' ')} — rotation −${rotHero}`);

    const change = changes.get(c.slug) ?? 0;
    const dropAmount = change < 0 ? Math.abs(change) : 0;

    return {
      c, heroBase: hero, dealBase: deal, dropAmount, modsDetected,
      heroReasons, dealReasons, candFamily,
      // shortlist by the best of either ranking (+ provisional drop bump so
      // droppers survive to be judged against the market)
      cutScore: Math.max(hero, deal + (dropAmount > 0 ? 25 : 0)),
    };
  });

  const shortlist = base.sort((a, b) => b.cutScore - a.cutScore).slice(0, MARKET_EVAL_CUT);

  // ── Pass 2: market position for the shortlist. Deal slot: below-market
  // rewarded, above penalised (v1). Hero slot: above-market is the extras-value
  // proxy and scores UP. ──
  return shortlist.map(({ c, heroBase, dealBase, dropAmount, modsDetected, heroReasons, dealReasons }) => {
    let hero = heroBase;
    let deal = dealBase;
    const baseHook = dropAmount > 0 ? 25 + Math.min(40, dropAmount / 1000) : 0;

    const mp = getMarketPosition({
      id: c.id, slug: c.slug, model: c.model,
      year: c.year, price: c.price, mileage: c.mileage,
    });

    let marketDiff: number | null = null;
    let dealScore: number | null = null;
    let dropQualifies = false;

    if (mp) {
      marketDiff = mp.priceDiff;
      const pricePct = mp.priceDiff / mp.medianPrice;                           // <0 = cheaper than market
      const milePct = (mp.mileageDiff !== null && mp.avgMileage)
        ? mp.mileageDiff / mp.avgMileage : 0;                                    // <0 = fewer km than average
      dealScore = -(pricePct + MILEAGE_WEIGHT * milePct);                        // >0 = good buy

      // Hero premium: above-median asking proxies extras value.
      if (pricePct > 0.05) {
        const premium = Math.min(40, Math.round(pricePct * 80));
        hero += premium;
        heroReasons.push(`${zar(mp.priceDiff)} above ${mp.cohortLabel} median — kitted-build premium`);
      }

      // Deal slot: v1 behaviour, capped either way.
      deal += Math.round(Math.max(-55, Math.min(55, dealScore * 120)));
      if (pricePct <= -0.03) dealReasons.push(`${zar(-mp.priceDiff)} below ${mp.cohortLabel} median (${mp.cohortSize} comps)`);
      else if (pricePct >= 0.03) dealReasons.push(`${zar(mp.priceDiff)} ABOVE ${mp.cohortLabel} median — not a deal`);
      else dealReasons.push(`priced at ${mp.cohortLabel} market`);

      if (mp.mileageDiff !== null && mp.avgMileage) {
        const mpct = Math.round((mp.mileageDiff / mp.avgMileage) * 100);
        if (mpct <= -8) dealReasons.push(`${Math.abs(mpct)}% below average km for the cohort`);
        else if (mpct >= 8) dealReasons.push(`${mpct}% above average km`);
      }

      // A drop is only a hook when it lands the car at/below fair value.
      if (dropAmount > 0) {
        if (dealScore >= 0) {
          deal += baseHook;
          dropQualifies = true;
          dealReasons.push(`price drop hook: ${zar(dropAmount)} off — now at/below market`);
        } else {
          dealReasons.push(`${zar(dropAmount)} drop, but still above market — no deal hook`);
        }
      }
    } else if (dropAmount > 0) {
      // Cohort too thin to judge honestly — dampened drop hook, flagged.
      deal += Math.round(baseHook * 0.4);
      dropQualifies = true;
      dealReasons.push(`${zar(dropAmount)} price drop (market unconfirmed — sparse cohort)`);
    }

    return {
      c: { id: c.id, slug: c.slug, title: c.title, model: c.model, price: c.price, province: c.province, photoCount: c.photoCount, photos: c.photos },
      dropAmount, marketDiff, dealScore,
      heroScore: Math.round(hero),
      dealSlotScore: Math.round(deal),
      dropQualifies, modsDetected, heroReasons, dealReasons,
    };
  });
}

function toSuggestion(e: Evaluated, slot: IgSlot, score: number, reasons: string[]): PostSuggestion {
  return {
    id: e.c.id, slug: e.c.slug, title: e.c.title, model: e.c.model,
    price: e.c.price, province: e.c.province ?? '',
    photoCount: e.c.photoCount, photo: firstPhoto(e.c.photos),
    dropAmount: e.dropAmount, marketDiff: e.marketDiff, dealScore: e.dealScore,
    heroScore: e.heroScore, modsDetected: e.modsDetected,
    slot, score: Math.round(score), reasons,
  };
}

// ── Slot planner — paces the hero-dominant weekly mix off the ig_posts log ───
// Hero is the default; a deal/drop/cta day only fires once hero has been fed
// (≥3 hero posts in the trailing 7 days) and its own window is empty.
const CTA_INTERVAL_DAYS = 21;

function getSlotPlanFor(evaluated: Evaluated[]): SlotPlan {
  const since7 = Math.floor(Date.now() / 1000) - 7 * 86_400;
  const counts: Record<string, number> = {};
  for (const r of db.all<{ slot: string; n: number }>(sql`
    SELECT slot, count(*) n FROM ig_posts WHERE posted_at >= ${since7} GROUP BY slot
  `)) counts[r.slot] = r.n;
  const hero7 = counts['hero'] ?? 0;

  if (hero7 >= 4) {
    const lastCta = db.get<{ value: string }>(sql`SELECT value FROM site_config WHERE key = 'ig_last_cta_suggested'`)?.value;
    const daysSinceCta = lastCta ? (Date.now() - new Date(lastCta).getTime()) / 86_400_000 : Infinity;
    if (daysSinceCta >= CTA_INTERVAL_DAYS) {
      return { slot: 'cta', reason: `audience CTA day — ${Number.isFinite(daysSinceCta) ? `none suggested in ${Math.round(daysSinceCta)} days` : 'never suggested before'}, and ${hero7} hero posts this week` };
    }
  }

  if (hero7 >= 3 && !(counts['drop'] > 0)) {
    const bestDrop = evaluated.filter(e => e.dropQualifies).sort((a, b) => b.dealSlotScore - a.dealSlotScore)[0];
    if (bestDrop) return { slot: 'drop', reason: `price-drop day — ${zar(bestDrop.dropAmount)} off and now at/below market; no drop post in 7d` };
  }

  if (hero7 >= 3 && !(counts['deal'] > 0)) {
    const bestDeal = evaluated.filter(e => (e.dealScore ?? -1) >= DEAL_SLOT_MIN).sort((a, b) => b.dealSlotScore - a.dealSlotScore)[0];
    if (bestDeal) return { slot: 'deal', reason: `deal day — genuinely below market (deal score ${bestDeal.dealScore!.toFixed(2)}); no deal post in 7d` };
  }

  return { slot: 'hero', reason: hero7 < 3 ? `hero day — only ${hero7} hero posts in the last 7d` : 'hero day — deal/drop/cta windows already served' };
}

// ── Public API ────────────────────────────────────────────────────────────────

// Full suggestion set: today's slot plan + the ranking for it. On a deal/drop
// day the slot pick leads and the hero ranking fills the rest of the list (the
// admin shortlist stays useful); on a cta day the list is the hero ranking
// (the CTA itself is a template, not a listing).
export function getIgSuggestions(limit = 3): IgSuggestionSet {
  const evaluated = evaluateCandidates();
  if (evaluated.length === 0) return { plan: { slot: 'hero', reason: 'no candidates' }, suggestions: [] };

  const plan = getSlotPlanFor(evaluated);

  const heroRanked = [...evaluated].sort((a, b) => b.heroScore - a.heroScore)
    .map(e => toSuggestion(e, 'hero', e.heroScore, e.heroReasons.length ? e.heroReasons : e.dealReasons));

  let suggestions: PostSuggestion[];
  if (plan.slot === 'drop' || plan.slot === 'deal') {
    const pool = plan.slot === 'drop'
      ? evaluated.filter(e => e.dropQualifies)
      : evaluated.filter(e => (e.dealScore ?? -1) >= DEAL_SLOT_MIN);
    const top = pool.sort((a, b) => b.dealSlotScore - a.dealSlotScore)[0];
    const lead = toSuggestion(top, plan.slot, top.dealSlotScore, top.dealReasons);
    suggestions = [lead, ...heroRanked.filter(s => s.id !== lead.id)];
  } else {
    suggestions = heroRanked;
  }

  return { plan, suggestions: suggestions.slice(0, limit) };
}

// Back-compat thin wrapper (email + admin shortlist callers).
export function getPostSuggestions(limit = 3): PostSuggestion[] {
  return getIgSuggestions(limit).suggestions;
}

// Classify a single listing's slot at PUBLISH time — Wesley posts whatever he
// likes from the admin, so the ig_posts log records what job the post actually
// did, not what the planner suggested.
export function classifyIgSlot(listing: { id: number; slug: string; model: string; year: number; price: number; mileage: number }): IgSlot {
  const changes = getRecentPriceChanges();
  const change = changes.get(listing.slug) ?? 0;
  const dropAmount = change < 0 ? Math.abs(change) : 0;

  const mp = getMarketPosition(listing);
  let dealScore: number | null = null;
  if (mp) {
    const pricePct = mp.priceDiff / mp.medianPrice;
    const milePct = (mp.mileageDiff !== null && mp.avgMileage) ? mp.mileageDiff / mp.avgMileage : 0;
    dealScore = -(pricePct + MILEAGE_WEIGHT * milePct);
  }

  if (dropAmount > 0 && (dealScore === null || dealScore >= 0)) return 'drop';
  if ((dealScore ?? -1) >= DEAL_SLOT_MIN) return 'deal';
  return 'hero';
}
