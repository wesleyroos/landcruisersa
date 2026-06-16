# Land Cruiser SA — Valuation Tool v1 (Build-Ready Spec)

> **Status:** Final v1 specification. Decisive. Build from this without further design.
> **House disclaimer phrase (canonical, import from one constant everywhere):**
> *"Estimates from observed asking prices, not confirmed sale prices — and not a finance or insurance valuation."*

---

## 0. Build outcome — deltas from this spec (2026-06-16)

The v1.0 thin slice is built and verified against a live prod-data snapshot. Two pre-flight tests against ~2,100 real listings drove changes from the spec as written:

- **Coverage:** 99% of real listings sit in a (model, year) that clears ≥5 comps; 11/12 models SOLID, only 78-series sparse (degrades to the manual-valuation path). Script: `scripts/valuation-coverage.mjs`.
- **A2 bracket test:** ~68–69% of listings fall inside the computed band — the structural ceiling for a market-comp tool without per-VIN spec data; the rest are genuinely cheap/dear, not errors. Scripts: `scripts/valuation-bracket-test.mjs`, `scripts/valuation-bracket-compare.mjs`.

**Engine deltas (validated, in code):**
1. **Delisted anchor DISABLED in v1** (`preferDelisted=false`). The delisted pool (~36 comps) is too thin — it widened to ±3 years and produced skewed cohorts that **doubled incoherent "sell-low/list-high" results (12%→5%) with no in-band gain**. Re-enable in phase 2 once the pool densifies, with a tight span cap. (Supersedes §3.1 delisted-preferred, §3.5 delisted context, and the §3.7 `anchorBasis==='active'` downgrade — that downgrade is **removed**, since every v1 estimate is asking-based by design; honesty lives in the disclaimer + sell discount, not a per-result penalty.)
2. **Asking ceiling anchored to the cohort's own upper quartile:** `clamp(base × conditionFactor × (1+w), p25→p75, p90)` — replaces the spec's `median×(1+w)`, which sat too low for tight cohorts. (Supersedes §3.6 ceiling formula.)
3. **Price-outlier trim** (1.5×IQR fence, keep ≥5 else untrimmed) added to `getCohortStats` so a mis-segmented/typo'd comp (e.g. a R2.8m "79") can't poison the median/percentiles. (Adds to §3.1.)
4. **Mileage fires at `kmCompCount ≥ 3`** (incl. young cohorts) — it's a flat heuristic, not a per-cohort fit, so the young-skip was over-cautious. (Relaxes §3.3.)
5. **Result framing = realistic-sell estimate + the real cohort spread (p25–p75) + suggested asking ceiling** (the chosen UX posture), so the ~32% outside the band reads as "you're at the top/bottom because of your km/condition," not a miss. (Confirms §6.1.)

**Scope shipped (v1.0):** model-slug constants, `getCohortStats` refactor (byte-for-byte `getMarketPosition` preserved), `valuation.ts`, `valuation_requests` table + deploy-safe migration, `POST /api/valuation` (honeypot + per-IP rate-limit + anonymous snapshot), ungated `/valuation/` hub (with no-JS POST fallback) + 12 programmatic `/valuation/[model]/` SSR pages (WebApplication+Dataset+FAQ schema, noindex-on-thin), nav link, sitemap.

**Deferred to v1.1** (was v1.0 in §9): the dealer-offer **lead-capture** step — `POST /api/valuation-lead`, the contact/consent/VIN fields on the form, the `/privacy/` page (legal gate for PII), admin surfacing of `dealer_offer_optin` rows, and the `track-event` beacon. Also deferred: extracting `getPriceDropSummary`/`getModelMarketStats` into shared libs (the price-movement context line). v1.0 captures **no PII** (anonymous vehicle+estimate snapshots only), so the privacy gate isn't yet binding.

---

## 1. Overview & Strategy

**What it is:** A public **"What's my Land Cruiser worth?"** tool at `/valuation/`. The user enters model + year + mileage (plus optional condition/extras/province), and we return an **honest range built from live comparable asking prices** we already aggregate, using a refactor of the existing `getMarketPosition` cohort engine.

**Why we're building it (strategic logic):**
1. **Traffic magnet.** The binding constraint is TRAFFIC, not data. "What is a 79 Series worth in SA" is the single highest-intent transactional query in the niche. 12 programmatic per-model SSR pages attack it for search + LLM citation.
2. **Lead funnel into the dealer sourcing loop.** Motivated private sellers who value their car are routed (opt-in, double-consented) to specialist dealer **Gys Pitzer** as pay-on-success bird-dog referrals. This is the only surface that monetizes scraped listings plus our own.
3. **Book-of-life north star (phase 2+).** Every valuation is persisted as a snapshot. An optional VIN (capture-only in v1) is the future spine key for a per-vehicle dataset — the exit-valuation moat — enriched later by TransUnion/Lightstone. **v1 depends on zero paid external data.**

**The governing principle (inherited from `getMarketPosition`):** *we only make a claim we can defend.* Thin cohort → no number → honest lead-capture. This is a feature: the funnel still fires.

**The honesty principle made load-bearing (this is the core change from the draft):** the adversarial review proved the draft's honesty was *cosmetic* — three biases all pushed the estimate **up** (active-pool survivorship, drop-conditional discount, age-confounded mileage OLS), then stacking pushed the floor implausibly **down**. v1 fixes the math so the framing is true:
- Anchor on **recently-delisted comps' last asking** where available (cars that actually cleared), not just the stale active pool.
- The asking→sell discount `d` is an **explicitly-labelled industry proxy** (TransUnion lower band), **not** a fake-precise blend of a drop-conditional statistic.
- **No live per-cohort OLS** for mileage (n is too small; price_events is days old). Flat, capped, percentage-of-value mileage rate.
- **Condition & extras adjust only the asking ceiling, never the realistic-sell floor** (a buyer won't pay for self-reported claims).
- **Compound floor** so the realistic low can never print absurdly below the cohort's own distribution.
- **Confidence degrades on weak inputs**, not just small cohorts.

---

## 2. Scope (IN / OUT)

| IN v1 | OUT (deferred) |
|---|---|
| Price-free `getCohortStats` core refactored out of `getMarketPosition` (byte-for-byte preserved for IG/listing callers) | VIN decode / VIN as data source (no paid decode dependency) |
| `valuation.ts` range algorithm: delisted-anchored median, capped %-of-value mileage delta, IQR-driven band, industry-proxy sell discount | TransUnion / Lightstone enrichment (paid) |
| One canonical table **`valuation_requests`** (anonymous snapshot + optional lead) | Full per-vehicle book-of-life / saved user history / accounts |
| One endpoint **`POST /api/valuation`** (compute) + **`POST /api/valuation-lead`** (capture) | ML/regression depreciation models |
| Ungated public `/valuation/` hub + 12 programmatic `/valuation/[model]/` SSR pages (indexable, schema-rich) | Free-text extras mining from descriptions/mods |
| Estimate is **NEVER gated**; only the dealer-offer upsell captures the lead | Confirmed-sale-price modelling (we record raw material, don't model the gap) |
| Two-consent POPIA, dealer opt-in, DB-first → best-effort Resend | Per-province cohorts (shatters sample) |
| Honest insufficient-data path → manual-valuation lead | Auto-forwarding PII to dealer (v1 = manual routing via Wesley) |
| VIN **OPTIONAL, capture-only**, nullable indexed column | |
| Honeypot + in-memory per-IP rate-limit (new code) | |
| New `/privacy/` page + `track-event` beacon (required, see §8/§9) | |
| Shared in-process `getPriceDropSummary(model)` lib (no self-HTTP) | |

---

## 3. Valuation Methodology

### 3.0 Input contract

```ts
interface ValuationInput {
  model: string;       // must be in LC_MODEL_SLUGS (Set membership, NOT normalizeModel)
  year: number;        // 1980 .. currentYear+1
  mileage: number;     // int km, 0 .. 600000 (form + API agree on this single bound)
  condition?: 'excellent' | 'good' | 'fair' | 'rough';  // self-reported; default 'good'
  extras?: string[];   // known keys only; unknown dropped
  province?: string;   // optional; captured for routing, NOT used in math
}
```

**Model validation — new single source of truth.** There is no `MODEL_SLUGS` export today (`normalizeModel` maps *free text* and returns `'other'` / hilux / fortuner). Add to `src/lib/sources/normalize.ts`:

```ts
export const LC_MODEL_SLUGS = [
  '70-series','76-series','78-series','79-series','80-series','100-series',
  '200-series','300-series','prado-150','prado-250','fj-cruiser','land-cruiser-fj',
] as const;
export const LC_MODEL_SLUG_SET = new Set<string>(LC_MODEL_SLUGS);
```
Validation, the form `<select>`, the `/valuation/[model]` allowlist, and the sitemap all import this. Reject anything not in the set (do **not** coerce to `'other'`, hilux, or fortuner).

### 3.1 Cohort selection — refactor `getCohortStats`

Extract the cohort core from `getMarketPosition` (in `src/lib/market-position.ts`) so both callers share one query path. **Two corrections vs the draft, mandated by the skeptics:**

1. **`new_or_used` filter.** The cohort must filter to `Used` for the valuation path (used sellers are the funnel target; New listings inflate the anchor). `getMarketPosition`'s IG path also values used listings, so this is safe — but we gate it behind an `includeNew` flag to keep `getMarketPosition` byte-for-byte if its current behaviour differs; default for valuation = Used only.
2. **Delisted-anchor support.** Add an optional path to build cohort stats from **recently-delisted** comps (`off_market_at` within N months) using their last observed asking — the best transacted-price proxy we own. This counters the active-pool survivorship-inversion bias (sold cars leave the pool; overpriced cars stay).

```ts
export interface CohortStats {
  cohortLabel: string;        // e.g. "2022–2024 79 Series"
  cohortSize: number;
  span: 1 | 2 | 3;            // year window actually used
  medianPrice: number;        // median asking of the cohort
  prices: number[];           // sorted asking prices
  p25: number; p75: number;   // interquartile (band)
  p90: number;                // for the asking-ceiling clamp
  minPrice: number; maxPrice: number;
  avgMileage: number | null;  // raw cohort avg; null if <5 comps with km>0
  kmCompCount: number;        // comps with km>0 (drives confidence)
  modelSupply: number;        // active same-model, all platforms
  anchorBasis: 'delisted' | 'active';  // which pool the median came from
  cohortMinYear: number;      // youngest-cohort detection
}

export function getCohortStats(
  input: { model: string; year: number },
  opts: { excludeId?: number; includeNew?: boolean; preferDelisted?: boolean; delistedMonths?: number } = {},
): CohortStats | null {
  // 1. Try DELISTED pool first (preferDelisted, default true for valuation):
  //    status IN ('sold','removed') AND off_market_at >= now - delistedMonths (default 6)
  //    AND model match AND price>0 [AND new_or_used='Used' unless includeNew]
  //    Widen span 1→2→3 until >=5. If >=5 → anchorBasis='delisted'.
  // 2. Else fall back to ACTIVE pool:
  //    status='active' AND listing_type='for_sale' AND model match AND price>0
  //    [AND new_or_used='Used' unless includeNew] [AND ne(id, excludeId) if given]
  //    Widen span 1→2→3 until >=5. If >=5 → anchorBasis='active'.
  // 3. If neither pool reaches 5 at ±3 → return null (insufficient data).
  //
  // Then: sort prices; medianPrice=median; p25/p75/p90 via index helpers;
  // avgMileage = mean of km>0 only if kmCompCount>=5 else null; modelSupply = active same-model.
}
```

**`getMarketPosition` is re-implemented on top of `getCohortStats`** (passing `excludeId` and the active pool to preserve its current behaviour) and re-adds `priceDiff`/`mileageDiff`/`history`. A **regression test pins byte-for-byte output** for ~10 real listings before merge.

> **Documented semantics (fixes the minor correctness bug):** `CohortStats.avgMileage` is the *raw cohort average*, independent of any subject's own mileage. `getMarketPosition`'s "null avgMileage when the listing's own km is 0" is a presentation guard layered in the wrapper — the two callers legitimately differ here. A unit test pins both.

**Dead-code fix:** remove the `if (span > 3) span = 3` clamp; the success path sets `span` via `break`, the failure path returns `null` before `span` is read.

### 3.2 Young-cohort / brand-new detection (blocker fix)

`prado-250` (launch 2024) and `land-cruiser-fj` (2026) have dense cohorts made entirely of near-MSRP young cars. Add a launch-year map and a structural rule:

```ts
export const MODEL_LAUNCH_YEAR: Record<string, number> = {
  'prado-250': 2024, 'land-cruiser-fj': 2026, '300-series': 2021, /* others older */
};
function isYoungCohort(input, cohort): boolean {
  const launch = MODEL_LAUNCH_YEAR[input.model] ?? 0;
  return (currentYear - input.year) <= 2
      || (cohort.cohortMinYear >= currentYear - 2)
      || (launch && input.year <= launch + 1);
}
```
When young: **use the reduced new/demo discount `NEW_VEHICLE_DISCOUNT = 0.04`**, **skip the mileage delta** (no used-market depreciation signal), and surface *"Recent model — limited used-market depreciation data; estimate is rougher."* This stops the tool telling a one-year-old Prado owner they've lost ~R110k.

### 3.3 Base value & mileage adjustment (in Rand)

Anchor = `medianPrice` (median, not mean — robust to the high-asking tail, consistent with `/market/[model]`).

**Mileage delta `M` — flat, percentage-of-value, capped. No live OLS in v1.**
The skeptics are right on all counts: n=8–14 asking points cannot support a credible univariate slope, year confounds mileage, `price_events` is days old, and the regression realistically never fires. So v1 ships a single transparent rate expressed as **% of value per km** (not absolute R/km), which self-scales across the R180k→R1.7m range and fixes the model-blind tail problems:

```
DEPRECIATION_RATE = 0.0000018 (fraction of value per km) ≈ 0.18% of value per 1,000 km
M = medianPrice × DEPRECIATION_RATE × (avgMileage − userMileage)   // fewer km than avg ⇒ M>0
```
- Rationale: ~R150k swing over 100k km on a R850k car (~18%), ~R30k on a R180k car — correct order of magnitude at both tails, no R/km clamp needed.
- **Cap:** `M = clamp(M, −0.15·medianPrice, +0.15·medianPrice)` (the deal-score's own ±-band feel; tighter than the draft's 18% to leave room in the compound floor).
- **If `avgMileage === null` or `kmCompCount < 5`:** `M = 0`, set `mileageAdjusted=false`, note *"mileage not factored — too few comparable listings report km."*
- **If `mileage === 0`:** `M = 0`, note *"add mileage for a tighter estimate."*
- Persist `mileage_method = 'flat' | 'skipped'` so we can justify per-model slopes later once cohorts densify. The deal-score `milePct` is **not** used here (different axis; avoids the cross-section naming clash).

### 3.4 Condition & extras — asking ceiling ONLY, never the sell floor (blocker fix)

The review is right: self-reported condition is optimistically biased, mods often *reduce* a mainstream buyer's price, and a dealer/buyer will not pay for unverified claims. So in v1, **condition and extras move the asking ceiling only** and are otherwise captured for the dealer brief and back-fitting. They do **not** enter `realisticSellMid`.

**Condition factor (applied to the ceiling base only; symmetric around realistic wear):**

| condition | factor | note |
|---|---|---|
| excellent | +3% | |
| good | 0% | baseline (most private cars have wear; not a bonus) |
| fair | −5% | |
| rough | −12% | |

**Extras (ceiling only, capped, single haircut — fixes double-discount).** Each Rand value is already a *resale uplift* (~40% of fitment), and because extras are excluded from the `d` discount, they are **haircut exactly once**. Hard caps: Rand extras `min(Σ, 0.10·median)`; paperwork `% min(Σ, 0.07·median)`; combined `E ≤ 0.15·median`.

```ts
export const EXTRAS_RAND = { diff_lock:12000, snorkel:3000, long_range_tank:10000,
  suspension:18000, dual_battery:7000, winch:9000, roof_tent:12000, roof_rack:4000,
  bull_bar:6000, wheels:8000, drawers:7000, tow_bar:3000 };
export const EXTRAS_PCT = { service_history:0.04, service_plan:0.05 };
```
UI label: *"Extras adjust the suggested asking price only, not the realistic-sell estimate — a buyer values mods individually, and some narrow your buyer pool. Captured so a specialist dealer can price them properly."*

### 3.5 Asking → realistic-sell discount `d` — labelled industry proxy (blocker fix)

The draft sourced `d` from `/api/admin/price-drop-stats` `medianPct`. **Verified in code (`price-drop-stats.ts` line ~35): the drops array only contains listings where `r.price < old` — a drop-conditional median that excludes non-droppers and full-asking delistings, and stops at last asking, not sale.** It is biased and pins `d` at the 8% floor anyway. The TransUnion 10–20% band is the *dealer-buy-vs-retail* spread, which our own research flags as scope-mismatched for private sale.

**Decision for v1:** `d` is a **single, flat, explicitly-labelled conservative proxy** — no fake data-anchoring.

```ts
export const SELL_DISCOUNT = 0.10;   // mid of the conservative 8–12% lower half of the TransUnion band
```
```
realisticSellMid = medianPrice + M          // base, mileage-adjusted; NO condition/extras
realisticSellMid = realisticSellMid × (1 − SELL_DISCOUNT)
```
UI/footer copy (verbatim, carries the research caveat): *"Private sellers typically realise below asking. We use a conservative ~10% gap as a guide — this is an industry proxy (the published South African trade-to-retail spread is 10–20%), not a measured private-sale figure. Your actual result depends on negotiation, condition and demand."*

**Live drop data is NOT used to drive `d` in v1** (price_events is ~5 days old; per-model `count≥5` almost never clears). It is surfaced *separately* as a "recent market movement" context line on the result and per-model pages via the shared in-process helper, clearly labelled *"observed asking-price reductions among listings that reduced, NOT confirmed sale prices."* When `price_events` has ≥90 days of data and per-model `count` is routinely ≥15, revisit driving `d` from a **population** statistic (including non-droppers as 0% and last-asking-before-delist via `off_market_at`).

### 3.6 The range, the compound floor, and the asking ceiling

```
band half-width  w   (see tiers, §3.7)

# Realistic-sell band (the headline, cohort-grounded):
sellMid  = (medianPrice + M) × (1 − SELL_DISCOUNT)
sellLow  = sellMid × (1 − w)
sellHigh = sellMid × (1 + w)

# COMPOUND FLOOR (blocker fix): never print below the cohort's own observed floor.
sellLow  = max( sellLow, p25 × (1 − SELL_DISCOUNT) )

# Suggested asking ceiling (secondary; clamped to observed reality — blocker fix):
ceilingBase = (medianPrice + M) × conditionFactor + E
askingCeiling = min( ceilingBase × (1 + w), p90 )   // never advise listing above the 90th pct of real comps
```
All displayed values use **proportional rounding** (fixes cheap-model jitter):
```ts
function roundRand(x:number){ return x>=400000 ? Math.round(x/5000)*5000
  : x>=150000 ? Math.round(x/2000)*2000 : Math.round(x/1000)*1000; }
```

### 3.7 Confidence tiers — driven by cohort size AND input quality (major fix)

The badge reflects the **weakest** input, not just sample count.

| Base tier | cohortSize | half-width `w` |
|---|---|---|
| high | ≥ 12 | ±6% |
| medium | 8–11 | ±9% |
| low | 5–7 | ±13% |
| none | < 5 | **no range → lead capture** |

**Downgrade one tier** (and append a `confidence_reasons[]` line) if any hold: `anchorBasis === 'active'` (no delisted comps); `span === 3`; `mileageAdjusted === false`; `kmCompCount < 5`; `isYoungCohort`. **Floor the displayed `w`** at `max(tierWidth, 0.5 × (p75 − p25) / medianPrice)` so a wide/skewed cohort shows an honestly wide band rather than a false-tight one. Tier never rises above `low` for 5–7 cohorts. Span is *not* used to raise a tier, only to lower one.

### 3.8 Fully worked example — 2023 79-series, 60,000 km, good, diff-lock + suspension + dual-battery + full service history, Gauteng

Cohort (delisted-preferred; assume 6 recently-delisted + active fill → 11 comps, Used only), asking R'000 sorted:
`985, 1010, 1040, 1055, 1070, 1085, 1100, 1120, 1145, 1180, 1240`.

- `cohortSize=11` → **medium, w=0.09**; `anchorBasis='delisted'` (no downgrade); `span=1`.
- `medianPrice = 1,085,000`; `p25 ≈ 1,040,000`; `p75 ≈ 1,145,000`; `p90 ≈ 1,180,000`; `maxPrice=1,240,000`.
- `avgMileage = 78,000`, `kmCompCount = 10` (≥5, OK).
- IQR floor on w: `0.5·(1,145,000−1,040,000)/1,085,000 = 0.048 < 0.09` → keep `w=0.09`.

**Mileage delta:**
```
M = 1,085,000 × 0.0000018 × (78,000 − 60,000) = 1.953 × 18,000 = +R35,154
clamp ±15% of median (±162,750): not capped → M = +R35,154
```

**Realistic-sell band (NO condition, NO extras):**
```
sellMid = (1,085,000 + 35,154) × (1 − 0.10) = 1,120,154 × 0.90 = R1,008,139
sellLow = 1,008,139 × 0.91 = 917,407 ; compound floor = p25×0.90 = 936,000 → sellLow = R936,000
sellHigh = 1,008,139 × 1.09 = R1,098,872
→ rounded: R936,000 – R1,100,000  (mid ≈ R1,010,000)
```

**Suggested asking ceiling (condition good ×1.00; extras E):**
```
Σrand = 12,000+18,000+7,000 = 37,000 ; cap 0.10·median = 108,500 → 37,000
pct = service_history 0.04×1,085,000 = 43,400 ; cap 0.07·median = 75,950 → 43,400
E = min(37,000 + 43,400, 0.15·1,085,000=162,750) = R80,400
ceilingBase = (1,085,000 + 35,154)×1.00 + 80,400 = 1,200,554
askingCeiling = min(1,200,554 × 1.09, p90=1,180,000) = min(1,308,604, 1,180,000) = R1,180,000
```

**Displayed:**
> **Your 2023 Land Cruiser 79 Series (60,000 km)**
> Realistic private-sale: **R936,000 – R1,100,000**
> Suggested asking price (list around): **R1,180,000** *(top of what comparable cars actually ask)*
> Confidence: **Medium** — based on 11 comparable 2022–2024 79 Series (incl. recently sold/delisted).
> *Estimates from observed asking prices, not confirmed sale prices — and not a finance or insurance valuation.*

Note the asking ceiling is now **clamped to R1,180,000** (the 90th percentile of real comps) instead of the draft's R1,300,000 above-market figure, and the realistic low is floored at the cohort's own p25 rather than stacking down to an insulting number.

---

## 4. Data Model & Migration

### 4.1 Canonical table — `valuation_requests`

**Decision:** ONE table named `valuation_requests` (anonymous estimate rows precede contact, so they aren't yet "leads"). Append to `src/db/schema.ts`:

```ts
export const valuationRequests = sqliteTable('valuation_requests', {
  id:            integer('id').primaryKey({ autoIncrement: true }),
  // inputs
  model:         text('model').notNull(),
  year:          integer('year').notNull(),
  mileage:       integer('mileage').notNull(),
  province:      text('province'),
  condition:     text('condition'),
  extras:        text('extras'),               // JSON array of keys
  // output snapshot (frozen — the live cohort drifts)
  sell_low:      integer('sell_low'),
  sell_mid:      integer('sell_mid'),
  sell_high:     integer('sell_high'),
  asking_ceiling:integer('asking_ceiling'),
  confidence:    text('confidence'),           // high|medium|low|none
  cohort_size:   integer('cohort_size'),
  cohort_label:  text('cohort_label'),
  anchor_basis:  text('anchor_basis'),          // delisted|active
  mileage_method:text('mileage_method'),        // flat|skipped
  // VIN — capture-only, nullable, indexed (phase-2 spine; NO decode in v1)
  vin:           text('vin'),
  vin_valid:     integer('vin_valid', { mode: 'boolean' }).notNull().default(false),
  // contact (nullable until the dealer-offer step)
  name:          text('name'),
  email:         text('email'),
  phone:         text('phone'),
  // consent & routing
  consent:            integer('consent', { mode: 'boolean' }).notNull().default(false),         // Consent A
  dealer_offer_optin: integer('dealer_offer_optin', { mode: 'boolean' }).notNull().default(false), // Consent B
  referred_at:        integer('referred_at', { mode: 'timestamp' }),
  // attribution
  source:        text('source').notNull().default('valuation_tool'),
  source_path:   text('source_path'),
  utm_source:    text('utm_source'),
  utm_medium:    text('utm_medium'),
  utm_campaign:  text('utm_campaign'),
  created_at:    integer('created_at', { mode: 'timestamp' }).notNull(),
});
export type ValuationRequest = typeof valuationRequests.$inferSelect;
```
`name/email/phone` are nullable because the estimate-step row is written before contact exists (see §5/§6 funnel decision).

### 4.2 Migration — `scripts/migrate.mjs` (the deploy gate)

**Critical correction (the draft was self-contradictory):** `addCol` + `REQUIRED_COLS` guard the **`listings` table ONLY** (the check runs against `pragma_table_info('listings')`). A **new table** uses `CREATE TABLE IF NOT EXISTS` (the `finance_leads` pattern). **Do NOT touch `REQUIRED_COLS`** — adding our columns there would falsely fail the boot. Omitting the `CREATE TABLE` block, however, 500s the site on first endpoint call. Add after the `finance_leads` block:

```js
db.exec(`
  CREATE TABLE IF NOT EXISTS valuation_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model TEXT NOT NULL, year INTEGER NOT NULL, mileage INTEGER NOT NULL,
    province TEXT, condition TEXT, extras TEXT,
    sell_low INTEGER, sell_mid INTEGER, sell_high INTEGER, asking_ceiling INTEGER,
    confidence TEXT, cohort_size INTEGER, cohort_label TEXT,
    anchor_basis TEXT, mileage_method TEXT,
    vin TEXT, vin_valid INTEGER NOT NULL DEFAULT 0,
    name TEXT, email TEXT, phone TEXT,
    consent INTEGER NOT NULL DEFAULT 0, dealer_offer_optin INTEGER NOT NULL DEFAULT 0,
    referred_at INTEGER,
    source TEXT NOT NULL DEFAULT 'valuation_tool', source_path TEXT,
    utm_source TEXT, utm_medium TEXT, utm_campaign TEXT,
    created_at INTEGER NOT NULL
  )`);
db.exec(`CREATE INDEX IF NOT EXISTS valuation_requests_created ON valuation_requests (created_at)`);
db.exec(`CREATE INDEX IF NOT EXISTS valuation_requests_model ON valuation_requests (model, year)`);
db.exec(`CREATE INDEX IF NOT EXISTS valuation_requests_vin ON valuation_requests (vin)`);
db.exec(`CREATE INDEX IF NOT EXISTS valuation_requests_dealer ON valuation_requests (dealer_offer_optin, referred_at)`);

// Idempotent future-column home (CREATE TABLE IF NOT EXISTS never alters an existing table):
const valCols = new Set(db.prepare("SELECT name FROM pragma_table_info('valuation_requests')").all().map(r => r.name));
const addValCol = (col, def) => { if (!valCols.has(col)) { db.exec(`ALTER TABLE valuation_requests ADD COLUMN ${def}`); } };
// e.g. addValCol('foo', 'foo TEXT') for any column added after first ship.
```
Also generate a Drizzle migration (`npx drizzle-kit generate`) for dev parity; prod relies on `migrate.mjs`. Batch this into the **same deploy** as the engine/page code (avoid a second ~45s-downtime deploy).

---

## 5. API Contract

**Decision: two endpoints.** `POST /api/valuation` (pure compute + anonymous snapshot) and `POST /api/valuation-lead` (lead capture / dealer routing). Both `export const prerender = false`. Compute runs **in-process** (synchronous better-sqlite3) — never self-HTTP the auth-gated admin endpoint.

**Shared lib extraction (no self-HTTP):** create `src/lib/price-drops.ts` `getPriceDropSummary(model?)` containing the aggregation logic currently in `price-drop-stats.ts`; the admin endpoint and the valuation surfaces both import it. Also extract `getModelMarketStats(model)` from `/market/[model].astro` into `src/lib/market-stats.ts` and refactor that page to use it.

### 5.1 `POST /api/valuation` — compute

Order of handler checks: **parse → honeypot (silent 200) → timing trap (silent 200) → rate-limit (429) → validate (400) → compute → best-effort anonymous insert → respond.**

Request:
```jsonc
{ "model":"79-series", "year":2023, "mileage":60000,
  "condition":"good", "extras":["diff_lock","suspension"], "province":"Gauteng",
  "utm_source":"ig", "website":"", "formRenderedAt": 1718530000000 }
```
Response (estimate available):
```jsonc
{ "ok": true,
  "draftId": 412,
  "estimate": { "sellLow":936000, "sellMid":1010000, "sellHigh":1100000,
    "askingCeiling":1180000, "confidence":"medium", "currency":"ZAR",
    "confidenceReasons":[] },
  "cohort": { "label":"2022–2024 79 Series", "size":11, "medianPrice":1085000,
    "avgMileage":78000, "modelSupply":31, "anchorBasis":"delisted" },
  "movement": { "note":"observed asking-price reductions among listings that reduced, not confirmed sale prices", "medianPct": null },
  "caveat": "Estimates from observed asking prices, not confirmed sale prices — and not a finance or insurance valuation." }
```
Response (insufficient data):
```jsonc
{ "ok": true, "draftId": 413, "estimate": null, "confidence":"none",
  "cohort": { "label":"79 Series", "size":3, "modelSupply":4 },
  "caveat": "We track only 3 comparable 79 Series right now — too few for an honest range. Leave your details and a specialist will value it manually." }
```
`draftId` is the id of the anonymous row written (best-effort, try/caught — never blocks the estimate). The `none` case still returns a `draftId` so the manual-valuation lead links to it.

### 5.2 `POST /api/valuation-lead` — capture / dealer routing

Mirrors `finance-lead.ts`: **DB-first, then best-effort Resend.** Required: `name`, `phone`, `email` (all three — matches finance-lead exactly, resolving the email-OR-phone disagreement), `model`, `consent === true`. Optional: `draftId` (UPDATE that row in place rather than orphaning a duplicate — resolves the one-row-vs-two question), `dealer_offer_optin`, `vin`.

```jsonc
{ "draftId":412, "name":"Thabo M", "phone":"0721234567", "email":"t@example.com",
  "consent":true, "dealer_offer_optin":true, "vin":"JTEBR3FJ40K123456",
  "model":"79-series", "year":2023, "mileage":60000, "website":"" }
```

| Status | When | Body |
|---|---|---|
| 400 | bad JSON / missing name+phone+email / missing model | `{"error":"Name, phone, email and vehicle are required."}` |
| 400 | `consent !== true` | `{"error":"Consent is required to be contacted."}` |
| 422 | VIN present but fails structural check | `{"error":"That VIN doesn't look right — it should be 17 characters."}` |
| 429 | rate-limited | `{"error":"Too many requests. Please try again in a minute."}` |
| 200 | honeypot tripped | `{"ok":true}` (no save, no email, never reveal trap) |
| 200 | success | `{"ok":true,"leadId":412}` |
| 500 | DB write failed | `{"error":"Could not save your request. Please try again."}` |

**Routing (double-gated, manual in v1):** internal notice email always fires on `consent` to `wesley@landcruisersa.co.za` + `wesley@grodigital.co.za` (`+ NOTIFY_EMAIL` if set — note this is an *addition*, not "mirroring" finance-lead, which doesn't use NOTIFY_EMAIL). The **dealer referral email to `DEALER_REFERRAL_EMAIL` (Fly secret, gated on being set) fires only when `consent === true AND dealer_offer_optin === true`**, stamps `referred_at` for idempotency, and skips if already stamped. **v1: dealer routing stays manual via Wesley** (the bird-dog agreement isn't papered enough to auto-forward PII); the email simply flags `WANTS DEALER OFFER — route to Gys`. If the dealer Resend send fails, do **not** stamp `referred_at` (so a later admin re-send can retry); the row is already safely persisted.

### 5.3 VIN — definitive resolution

**VIN is OPTIONAL and capture-only. Never required to unlock anything.** Rationale: TRAFFIC is the binding constraint; a required VIN we can't decode in v1 is pure friction; the estimate must stay ungated for SEO/citation. We *invite* it with a benefit frame to seed the phase-2 spine at zero cost. Validation is structural only:
- Normalise: uppercase, strip spaces/hyphens. Length exactly 17. Charset `[A-HJ-NPR-Z0-9]` (excludes I, O, Q).
- **Do NOT enforce the ISO-3779 check digit** — ZA/JDM-origin Toyotas commonly fail it; enforcing rejects real customers.
- Soft dedup: indexed, **no unique constraint** (re-valuations form the future per-vehicle timeline). No `vehicles` table, no decode, no enrichment in v1.

### 5.4 Spam protection (new code — not in finance-lead)

`/api/valuation*` are the first public, high-volume, unauthenticated endpoints, so they get protection even though finance-lead has none:
1. **Honeypot** `website` field (CSS-hidden, `tabindex="-1"`, `autocomplete="off"`, `aria-hidden="true"`): non-empty → silent 200, no write.
2. **Timing trap:** `formRenderedAt` hidden field; submissions <2s → silent 200.
3. **In-memory per-IP rate-limit:** module-scope `Map`, read IP from `Fly-Client-IP`/`X-Forwarded-For`. **12 compute + 4 lead calls per IP per 10 min** → 429. Sweep stale entries each call. **Explicitly process-local** — dies on the ~45s deploy and would not survive a future 2nd Fly machine (which needs a Turso migration first); acceptable for v1.

---

## 6. UX & Funnel

**Route:** top-level `/valuation/` (hub) + `/valuation/[model]/` (programmatic). NOT under `/market/` — it is a conversion funnel, not a reference dataset.

**Nav (resolve the label/placement clash):** insert `{ label: 'Value My Cruiser', href: '/valuation/' }` as the **2nd** `NAV_LINKS` item (after Listings) in `src/data/navigation.ts`. Verb-led, owner-framed, highest-intent slot. (Unlike `/market/`, this is a human conversion surface and should be in nav.)

**The gate — definitive resolution of the three-way contradiction:** **DO NOT gate the estimate.** Showing the full range free is what earns SEO/LLM citation and trust; the number is the citable asset. The lead is captured by offering **more** (a real dealer offer), not by withholding. No blur, no email-to-sharpen, no VIN gate. This kills the draft's "blur/lock the exact numbers" path entirely.

### 6.1 Screen states

**A — Estimator (input).** Single centered card, surface `#F5F3EE`, white card `border-radius:0.875rem`. Eyebrow "FREE INSTANT ESTIMATE", H1 "WHAT'S MY LAND CRUISER WORTH?" (Barlow Condensed, uppercase). Required: Model `<select>` (the 12 LC slugs via `modelLabel`), Year `<select>` (1990→2026 in the picker; API still accepts 1980+), Mileage `<input type=number>` (0–600,000). Optional: Condition pills (`Showroom/Good/Average/Needs work`), Province `<select>`, Extras chip multi-select. **70-family disambiguation:** group 79 (bakkie) / 76 (wagon) / 78 (Troopcarrier) / 70 with body-style hints + thumbnails so a layperson doesn't confidently value the wrong slug. Submit "SEE MY ESTIMATE →" (`Button primary lg`), disabled until model+year+mileage valid.

**B — Full Result (no gate).** Renders in place. Hero range bar `R sellLow — R sellMid — R sellHigh` (Barlow Condensed, mid emphasized, orange `#F5A623` marker). Then: confidence + comp-count line; `.mp-tile` 3-up (median / avg mileage / supply→`/market/[model]/`); a 3–6 row comps list (year·km·province·asking, linking to live listings); a **suggested asking-ceiling** line clearly secondary to the realistic band; the recent-movement context line (labelled, not driving `d`); and the prominent `.safety-card` honesty caveat. If `confidence==='none'`: no band — show the honest "not enough data, value it manually" copy straight into the dealer CTA.

**C — Dealer-loop CTA (the monetizing step).** Below every result (and the only CTA on the thin path):
> **WANT A FIRM CASH OFFER ON THIS CRUISER?**
> We work with a specialist Land Cruiser dealer who buys exactly these. Share your details for a **no-obligation cash offer** — no listing, no test-drives. You're free to say no and sell privately.

Click → inline form (mirrors finance-lead expand): Name (req), Phone (req), Email (req), read-only vehicle summary. **Two distinct POPIA consents** (resolves the one-vs-two clash — unify on TWO everywhere):
- ☐ **Consent A (required):** *"I agree that Land Cruiser SA may contact me about this valuation and store the details I've entered. I've read the [Privacy Policy](/privacy/)."*
- ☐ **Consent B (optional, dealer):** *"Yes — share my vehicle and contact details with Land Cruiser SA's specialist dealer partner for a no-obligation cash offer."*
- Disclosure line (conflict-of-interest, required): *"We may earn a referral fee if you sell through a partner dealer. This does not change your valuation, which is computed from market listings."*

Anti-bait rules: never show the estimate band inside the dealer form; always show the "say no / sell privately" line; secondary CTAs **List it yourself, free →** `/listings/submit/` and **Browse the market →** `/market/[model]/` at equal prominence.

### 6.2 Compute model & interactivity (vanilla JS `define:vars`, resolve the architecture clash)

- Form POSTs to `/api/valuation`; result rendered from the returned JSON. Numbers are **not secret** (must be crawlable), so there is no client-side hide/unblur. Holds `draftId` in JS.
- Dealer CTA submits to `/api/valuation-lead` with the held `draftId` (UPDATE in place) — fire-and-forget for capture; a lead-save hiccup never traps the user.
- **Changing any input after a result** → fresh `/api/valuation` fetch + new `draftId`; resets the dealer form to un-submitted. **Mid-funnel null:** if a recompute returns `confidence:'none'`, replace the band with the honest insufficient-data state and surface the dealer CTA (do not leave a stale band).
- Track funnel via the **new** `/api/track-event` beacon (see §9 — existing `track-click` has a fixed whitelist requiring `listing_slug` and cannot carry these): `valuation_view`, `valuation_computed`, `valuation_lead_open`, `valuation_lead_submit`, `dealer_optin`, carrying `sessionStorage` UTM.

**No-JS / crawler path (resolve the SSR-vs-citation tension).** The page `<form method="POST" action="/valuation/">` posts to itself; the **page frontmatter handles `Astro.request` POST**, runs `estimateValue()` server-side, and renders the **full result with no gate** (degrade open). The per-model `/valuation/[model]/` page **pre-computes the model-level range at SSR on GET** (no compute-at-page-load only applies to the hub's blank form) so crawlers/LLMs always see real dated numbers. The dealer CTA degrades to a plain server form. Honesty caveat always renders server-side.

**Loading/mobile:** "CRUNCHING THE MARKET…" disabled button + skeleton band; single column; sticky bottom dealer CTA bar on mobile once a result shows (`.mobile-cta` pattern).

### 6.3 Accessibility (was missing)

`label[for]` on every field; `aria-live="polite"` on the result band so the estimate is announced; keyboard-operable extras chips and condition pills (`role="radio"`/`checkbox`, arrow-key nav); focus moves to the result heading on render; honeypot `aria-hidden="true"` + `tabindex="-1"`; AA contrast on all text.

---

## 7. SEO / AI-Citeability & Programmatic Per-Model Pages

**Two surfaces:** `/valuation/[model]/` (12 SSR pages — the citable surface) and the embedded tool (converts). Page ranks, tool converts.

**`src/pages/valuation/[model].astro`**, `prerender=false`, slug validated against `LC_MODEL_SLUG_SET` (redirect unknown → `/valuation/`). Reuses `getModelMarketStats(model)` + `getCohortStats`. Content order: eyebrow `Valuation · Updated <date>`; H1 `<Label> Land Cruiser Value in South Africa`; **citeable lede** (number-dense, first 120 chars, range+median+count+date); embedded tool (pre-loaded with model); value-context paragraph; asking-by-year table (reused); recent movements (labelled); FAQ; disclaimer; cross-links.

**Thin-content guard:** model with `cohortSize<5` → render with `<meta name="robots" content="noindex, follow">` (Base supports `noindex`), show context + manual-valuation lead copy, no fabricated number. Re-indexes automatically when supply recovers (SSR).

**JSON-LD:** pass a `@graph` array (WebApplication + Dataset + FAQPage) to Base's existing `schema` prop — no Base change. The **Dataset** carries `variableMeasured` (median/min/max/count), `dateModified`, `creator: Land Cruiser SA`, and `isBasedOn` the `/market/[model]/` page. FAQ uses literal query phrasing ("What is a `<Label>` worth in South Africa?"). Every numeric answer ends with the canonical disclaimer phrase.

**Sitemap (resolve the mechanism gap):** the sitemap is `@astrojs/sitemap` with a **static `customPages` array in `astro.config.mjs`**. Add the 12 `/valuation/<model>/` URLs + `/valuation/` to `customPages`. Static `customPages` cannot dynamically drop a model that goes thin — the page's `noindex` meta handles crawlers; the residual "noindex URL still in sitemap" smell is accepted for v1.

**Internal link graph:** hub→12 model pages; each `/valuation/<model>/` ↔ `/market/<model>/`; → asking-vs-selling article; listing detail → `/valuation/<model>/`; model guides → `/valuation/<model>/`; article closing list → valuation pages. All surfaces use the **single canonical disclaimer constant** so the "SA reference for asking-vs-selling" authority claim is byte-consistent.

---

## 8. POPIA, Liability & Trust

**`/privacy/` does not exist (verified). Creating it is a REQUIRED launch task, not an open question** — the consent checkboxes link to it and the form is non-compliant until it describes: purpose (valuation, contact, optional dealer sharing), recipients (Land Cruiser SA; if Consent B, the named dealer partner), data stored (name/phone/email/vehicle/estimate/VIN), and **retention: 24 months**, then deletion/anonymisation, with a deletion request address (`wesley@landcruisersa.co.za`).

**Two consents (canonical, §6.1):** A = contact+store (required, gates `/api/valuation-lead`). B = `dealer_offer_optin` (optional, authorises third-party PII sharing with Gys Pitzer). Server rejects 400 if A is false. Dealer email forbidden unless A **and** B are true.

**Anonymous-snapshot POPIA handling (review fix):** the anonymous `/api/valuation` row stores vehicle + province + estimate but **no contact and no consent**. We do **not** treat province+mileage as sufficient to identify; a processing notice appears on the form even for anonymous use. When a user later submits contact, we **UPDATE the existing `draftId` row** (linking PI to the prior anonymous snapshot) — and that UPDATE only happens on the consented `/api/valuation-lead` call, so PI is never attached without fresh consent.

**Liability framing (load-bearing, not captions):** ranges + median + cohort size + date, never point estimates; insufficient-data degrades to lead capture; confidence degrades on weak inputs (§3.7); asking ceiling clamped to real comps; realistic floor compound-floored. Required disclaimer block near every result and stored gist with the lead:

> **This is a market estimate, not a guaranteed offer or financial advice.** Figures are based on **observed asking prices** of similar Land Cruisers currently or recently listed across South Africa — **not confirmed sale prices** — aggregated by Land Cruiser SA. Vehicles usually sell for less than asking, and a vehicle's real value depends on condition, history and spec we cannot see. Use this as a starting point, get an in-person inspection, and consult a registered valuation provider before buying or selling. Land Cruiser SA accepts no liability for decisions made on this estimate, is not a registered credit or financial services provider, and this tool is not a valuation in terms of any regulation.

---

## 9. Build Plan (ordered, deploy-safe)

**Critical path:** A1 → A2 → B. The whole feature is gated on the **A2 bracket test** (do computed ranges bracket real listings' asking prices for the dense models?). Build A1+A2 and run §10's bracket test **before** committing to the funnel.

| # | Task | File | Gate |
|---|---|---|---|
| 1 | `LC_MODEL_SLUGS` + `LC_MODEL_SLUG_SET` + `MODEL_LAUNCH_YEAR` | `src/lib/sources/normalize.ts` | |
| 2 | Extract `getCohortStats` (delisted-pref, Used filter, p25/p75/p90); re-impl `getMarketPosition` on top | `src/lib/market-position.ts` | regression test |
| 3 | `valuation.ts` — `estimateValue()` (flat mileage %, compound floor, ceiling clamp, tier+downgrade) + constants | `src/lib/valuation.ts` | A2 bracket test |
| 4 | Extract `getPriceDropSummary(model?)` (in-process; admin endpoint imports it) | `src/lib/price-drops.ts` | |
| 5 | Extract `getModelMarketStats(model)`; refactor market page to use it | `src/lib/market-stats.ts`, `src/pages/market/[model].astro` | |
| 6 | Schema: `valuationRequests` + type | `src/db/schema.ts` | |
| 7 | **Migration: `CREATE TABLE IF NOT EXISTS` + indexes (NOT REQUIRED_COLS)** | `scripts/migrate.mjs` | **deploy-blocking** |
| 8 | Drizzle gen for dev parity | `drizzle/<ts>_valuation_requests.sql` | |
| 9 | `POST /api/valuation` (compute + honeypot/timing/rate-limit + anon insert) | `src/pages/api/valuation.ts` | |
| 10 | `POST /api/valuation-lead` (clone finance-lead; dual consent; dealer gating; draftId UPDATE) | `src/pages/api/valuation-lead.ts` | |
| 11 | `track-event` beacon + table (existing track-click can't carry valuation events) | `src/pages/api/track-event.ts`, schema + migrate `CREATE TABLE` | deploy-blocking |
| 12 | Hub page + result component (SSR POST handler for no-JS) | `src/pages/valuation/index.astro`, `src/components/ValuationResult.astro` | |
| 13 | Programmatic per-model pages (SSR, @graph schema, noindex-on-thin) | `src/pages/valuation/[model].astro` | |
| 14 | Nav link (2nd item) | `src/data/navigation.ts` | |
| 15 | Sitemap `customPages` (12 + hub) | `astro.config.mjs` | |
| 16 | `/privacy/` page (dealer-sharing + 24-mo retention) | `src/pages/privacy.astro` | **legal launch gate** |
| 17 | Cross-links (market, listing detail, model guides, article) | various | |
| 18 | Admin surfacing of `dealer_offer_optin` rows (**required, not optional**) | `src/pages/admin/*` | |

**Sequencing / thin-slice:** **v1.0** = tasks 1–9, 12–16 in ONE deploy = ungated, indexable, working tool + table created. **v1.1** = tasks 10, 11, 17, 18 (the lead loop + admin) a few days later, **no second migration** (table already exists; add the small `track_event` table in the v1.0 deploy too to avoid two downtime windows).

**Effort:** ~4 build-sessions (~2 days) full v1; ~2.5 sessions for the ungated thin slice.

**Admin visibility is promoted to required** (review fix): because Resend is best-effort and dealer routing is manual in v1, there must be a reliable read surface for `dealer_offer_optin=true` rows — the monetization loop has no other guaranteed action path.

---

## 10. Testing / Verification

- **Engine regression (must pass first):** capture `getMarketPosition` output for ~10 real active listings; refactor; assert identical `medianPrice/priceDiff/cohortLabel/cohortSize`. Unit-test the documented `avgMileage` semantics divergence between the two callers.
- **A2 bracket test (go/no-go):** feed ~20 real listings' own specs into `estimateValue()`; the `sellLow–askingCeiling` span should bracket the actual asking in the majority; a known-cheap deal sits near `sellLow`, overpriced near `askingCeiling`. If not, widen/annotate before building the funnel.
- **Bias checks:** confirm `anchorBasis` prefers delisted where ≥5 exist; confirm condition/extras move **only** the asking ceiling; confirm the compound floor binds on stacked-down inputs (fair + low km + high `d`) so `sellLow` never drops below `p25×(1−d)`; confirm `askingCeiling ≤ p90`.
- **Young-cohort:** 2024 prado-250 → reduced 4% discount, mileage skipped, caveat shown.
- **Sparse / edges:** land-cruiser-fj 2010 → `null` → lead path; mileage 0 → `M=0`; mileage 600,000 → capped; unknown slug / `other` / fortuner → 400; year 1985 (API) vs picker 1990 floor.
- **Lead loop:** no consent → 400; consent + `dealer_optin` → row written, dealer email fires (or skips if no `DEALER_REFERRAL_EMAIL`), `referred_at` stamped; break Resend key → row still saved (DB-first); dealer-send failure → `referred_at` NOT stamped.
- **Migration:** `node scripts/migrate.mjs` against a prod-shaped DB copy → table+indexes created, exits 0, no `listings` `REQUIRED_COLS` regression.

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Sparse cohorts for 78/FJ/80/100/70/land-cruiser-fj | Widening ±1→±3 + delisted pool maximises hits; honest null → lead (the high-value point); A2 pre-flight tells us coverage before launch |
| Asking-price upward bias | Delisted-anchor where ≥5; compound floor; asking ceiling clamped to p90 |
| Mileage double-counting / age confound | No live OLS in v1; single flat %-of-value rate, capped; logged for later per-model fit |
| Drop-stat selection bias | `d` is a labelled flat industry proxy, not the drop-conditional median; drop data shown as separate, caveated context only |
| Self-report optimism / mods over-valuation | Condition + extras touch asking ceiling only, never the sell floor |
| Small-sample median jitter | IQR-floored band width; delisted+active fill; persist cohort snapshot for reproducibility |
| Conflict-of-interest perception | Explicit referral-fee disclosure; equal-prominence "sell privately" CTAs; estimate computed from market, not from the dealer |
| Spam / scrape of the pricing moat | Honeypot + timing + per-IP rate-limit; estimate is range-only (not raw cohort dump) |
| `/privacy/` 404 = non-compliant | Required launch task 16 |
| Refactor breaks IG/listing badges | Byte-for-byte regression test (task 2) |

---

## 12. Success Metrics

- **Traffic** (binding constraint): organic + cross-link sessions to `/valuation/` and `/valuation/<model>/`.
- **Completion rate:** % of visits that submit and get an estimate.
- **Insufficient-data rate:** % returning `none` — cohort-coverage proxy.
- **Lead rate:** % of estimate-viewers who submit the dealer-offer form.
- **Dealer opt-in rate** (`dealer_offer_optin=true`): the direct monetization signal — bird-dog hand-offs to Gys Pitzer. A handful/month validates the loop.
- **AI citation:** `/valuation/<model>/` cited by LLMs as the SA Land Cruiser valuation reference.

---

## 13. Phase 2+ Roadmap

### 13a. Sharpening the valuation engine (data accrual, no partners needed)

1. **Population-based `d`:** once `price_events` has ≥90 days and per-model `count≥15`, drive the sell discount from a true population statistic (non-droppers as 0%, last-asking-before-delist via `off_market_at`), per model, with confidence degradation when thin.
2. **Per-model mileage slopes:** back-fit from the persisted `valuation_requests` snapshots + dealer-loop outcomes (what Gys actually paid), replacing the flat rate; require ≥30 comps and an age-controlled (price ~ mileage + year) fit before trusting a per-cohort slope.
3. **Extras coefficients:** back-fit real resale uplifts from dealer outcomes; only then let extras influence the realistic-sell number.

### 13b. VIN spine → "Land Cruiser Book of Life" (the exit-valuation moat)

The v1 tool seeds the spine for free (capture-only `valuation_requests.vin`, §5.3). The destination is a **VIN/registration-keyed per-vehicle report = History + Valuation + Model intelligence** — the SA, Land-Cruiser-specific answer to **carVertical** (the global VIN-history product a sample of which prompted this direction, 2026-06-16).

4. **VIN spine:** introduce a `vehicles` table keyed on normalised VIN; backfill from `valuation_requests.vin`; build the valuation-over-time timeline per VIN (we already own this layer — it's the v1 engine running over time).
5. **History layer (the data-partnership layer we don't have):** accident/damage, mileage trajectory & rollback, theft, write-off (code 2/3/4), finance/HPI. The hard, defensible part — sourced from SA providers (TransUnion Auto, Lightstone, NaTIS/SAPS) and, critically, partner-proprietary feeds.
6. **Model-intelligence layer (uniquely ours):** generation-specific known issues, what mods add vs destroy value, resale demand, what-to-check per series — editorial + our market data. carVertical has nothing like this.

**Why this beats carVertical in SA — the validated thesis:** the carVertical sample report was **~90% empty for a SA-registered vehicle** (European theft DBs, a single mileage record, no service history). carVertical is **data-starved in South Africa** — that gap is the entire opening. The incumbents (TransUnion/Lightstone) hold the data but sell it wholesale; nobody packages it as a trusted, niche, enthusiast-grade Book of Life with an integrated valuation. Defensibility = SA data access + community trust + the integrated valuation engine + the channel below (not the raw data, which others can also license).

### 13c. mSure / Motus partnership — the data + distribution accelerant

A potential partner exists via Wesley's father-in-law, **CFO of mSure** (a Motus insurance/VAP arm). This is the lever that turns 13b from a someday-idea into a fundable product, and it cuts both ways:

7. **Data IN (moat):** Motus dealer service/reconditioning records + mSure claims/write-off data + any TransUnion/Lightstone feeds they already license → proprietary SA history data carVertical cannot reach.
8. **Distribution & revenue OUT (B2B2C — sidesteps the traffic constraint):** the same engine serves **mSure underwriting & claims** (risk pricing + fraud detection), **Motus dealers** (Book of Life as a per-car VAP — carVertical's actual revenue model with better SA data), and **consumers** via the site. A B2B contract + proprietary data is a far stronger exit story than a lead-gen site.

**Before committing engineering:** the partnership must answer (a) what data mSure/Motus can actually expose; (b) appetite — paid pilot vs B2B supply vs JV/equity; (c) which pain they'd pay to solve first (underwriting accuracy / VAP revenue / claims fraud), which dictates which layer ships first. **TransUnion/Lightstone enrichment stays funded-only and gated on a concrete partner/revenue commitment** — never on the v1 critical path. (Full strategic context: memory `project-book-of-life-msure`.)
