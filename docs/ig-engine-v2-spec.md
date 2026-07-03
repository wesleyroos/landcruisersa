# IG Post Engine v2 — "Hero Engine" Spec

**Status:** BUILT + shipped 2026-07-03 (Phases 1 & 2 in one pass); Phase 3 = retune at reviews. KPI bet: prediction-ledger P13 (review 2026-08-03)
**Decisions (Wesley, 2026-07-02):** hero-dominant post mix ✔ · build the Graph API insights loop ✔
**Supersedes:** the dealScore-ranked suggestion list in `src/lib/post-suggestions.ts` (dealScore survives, demoted to one slot).

## Why v1 failed

v1 ranks by *"best buy"* (below-market price, low mileage). Wesley never posts its suggestions — he hand-picks an impressive kitted build and posts that, and it outperforms. The Jun 4 – Jul 1 2026 Meta export proves him right:

- Top 3 IG posts = 130 of 160 monthly follows; all expensive kitted 79s (R1.89M "R800k of extras" → 68 follows; "BEAST MODE" R1.6M → 39; R2.6M 2024 → 23).
- Cheap-vs-market listings: views but ~zero follows (R454k 2015 79: 6.3k views, 1 follow).
- Follows/1k views: listings 1.85, price-drops 0.43, guide promos 0.23.

v1's dealScore *penalises* above-market prices — which is exactly where hero builds live (extras push asking way over the cohort median). The engine optimised the wrong objective.

**New objective: audience growth (follows/reach).** The audience is the asset WBC sponsors (see deal-ledger D1). Buyer-conversion posts remain, as minority slots.

## 1. HeroScore (new primary ranking)

Deterministic and explainable — no ML (business-brain guardrails apply). All weights are initial guesses to be tuned against real IG metrics at the 2-weekly reviews.

| Signal | Detection | Points (initial) |
|---|---|---|
| **Mod lexicon** | Distinct mod *categories* hit in description (see below) | +12 per category, cap +60 |
| **Premium-for-model** | `pricePct = (price − cohortMedian)/median` via existing `getMarketPosition()`; above-market = extras proxy | +min(40, pricePct × 80) when pricePct > 0; no penalty below market |
| **Family prior** | `modelFamily()` | 70-series +25, main-line +10, FJ +10, Prado 0 (seeded from Jun baseline; tunable map) |
| **Mint condition** | mileage < 60k km / year ≥ (now−4) | +15 / +10 |
| Photos | ≥8 / ≥5 (keep from v1) | +15 / +8 |
| Freshness | listed ≤7d (keep) | +10 |
| Demand | log-damped model+slug views (keep, lower weight ×0.5) | as v1 × 0.5 |
| Rotation | family-level, **halved** for the hero slot — data says 79s just win, don't fight it hard | `[11, 8, 6, 4, 2]` |

**Mod lexicon categories** (one hit each, case-insensitive; keep as a const map in the scorer so reviews can extend it):

- **armour:** bull bar, bullbar, Onca, LAS, rock slider, side steps, bash plate, skid plate, rear bumper, replacement bumper
- **recovery:** winch, Warn, recovery points, Maxtrax
- **suspension:** BP51, lift kit, suspension upgrade, Old Man Emu, OME, King shocks, Tough Dog
- **power:** GTurbo, G380, turbo upgrade, intercooler, ECU, dyno, NPC clutch, exhaust upgrade
- **touring:** roof tent, rooftop tent, canopy, Bushtech, Alu-Cab, RSI, drawer system, drawers, long range tank, long-range tank, dual battery, solar, fridge slide, awning, compressor
- **stance:** rims, mags, BFG, BFGoodrich, mud terrain, all terrain, 33", 35", Maxxis, Cooper

Secondary tell: ≥6 bullet/dash lines in the description → +8 ("spec-sheet build").

## 2. Slot-based suggestions (hero-dominant mix)

The engine returns a **slot plan**, not one ranked list. Weekly policy:

| Slot | Cadence | Ranking | Job |
|---|---|---|---|
| **hero** | ~4–5/week (default) | HeroScore | Grow the audience |
| **deal** | ≤1/week | v1 dealScore (unchanged) | Serve buyers, listing clicks |
| **drop** | ≤1/week, only when the drop lands at/below market | v1 hook logic (unchanged) | Conversion |
| **cta** | ~1–2/month | static template | Seller acquisition ("List your Cruiser — 18.8k buyers"; did 5.5k views Jun) |
| ~~guides~~ | **removed from IG suggestions** | — | Flopped on IG (726–1,005 views, 1 follow); LLM citation is their channel |

Slot selection: count posts per slot in the trailing 7 days from the `ig_posts` log (§4); recommend the most under-served slot, hero by default. Admin card + 07:00 email show today's slot + its top candidate, with the other slots' leaders collapsed below (keeps the existing "More suggestions" pattern).

## 3. Hero captions with hook lines

Both FB outliers and the best IG posts opened with a hook ("Check out this beast!", "BEAST MODE ACTIVATED", "Done right!"). `buildCaptionWithAIHashtags()` gets a hero-slot mode: **one-line hook opener + the 3 most impressive mods above the fold**, then the spec line (price/km/region) and the standard hashtag block. Deal/drop slots keep the current spec-sheet format.

## 4. Data model + insights loop

New (⚠️ every column/table must also go into `scripts/migrate.mjs` — addCol + REQUIRED_COLS — or the deploy 500s):

- `listings.ig_media_id` (text, nullable) — set by the publish job in `api/admin/instagram/post.ts` (the Graph API publish response returns it).
- **`ig_posts`** — the post log, one row per publish: `id, listing_id (nullable — cta posts have none), slug, slot, media_id, caption, posted_at`. Written by the publish job alongside `ig_posted_at` (which stays, for rotation compat).
- **`ig_post_metrics`** — append-only snapshots: `media_id, fetched_at, views, reach, likes, comments, saves, shares, profile_visits, follows` (nullable per-metric; availability varies by API version/account type).
- **`ig_suggestion_log`** — one row/day from the morning-email job: `date, slot, listing_id, score`. Powers the acceptance-rate KPI.

**Insights ingestion:** daily job (piggyback the existing 07:00 Fly scheduler in `post-suggestion-scheduler.ts`) fetches Graph API media insights for every `ig_posts` row < 30 days old, appends a snapshot. Uses the existing IG token/refresh machinery (`api/admin/instagram/*`). This replaces the monthly manual CSV export.

**ig-outcomes v2:** extend `api/admin/ig-outcomes` to join `ig_post_metrics` (latest snapshot per post) so one curl returns site outcomes *and* IG outcomes per post + per-slot rollups.

## 5. KPIs (how we know v2 works)

Baselines from Jun 2026 (docs in memory: project-social-baseline-2026-06):

1. **Acceptance rate** — % of published posts that were the day's #1 (or top-3) suggestion. v1 ≈ 0%. Target: >50% within a month. *This is the whole test: if the card shows the build Wesley would have hand-picked, the engine works.*
2. **Follows/post** — Jun baseline 6.2 avg (160/26). Hero-slot target: >10.
3. **Follows/1k views** — listings baseline 1.85.
4. Secondary: reach/post, saves/post (saves signal aspiration).

## 6. Rollout

- **Phase 1 (one session):** HeroScore + mod lexicon, slot planner, hero caption mode, `ig_suggestion_log`. Ship — the suggestion card immediately starts showing hero builds.
- **Phase 2 (one session):** `ig_media_id` + `ig_posts` + `ig_post_metrics` + ingestion job + ig-outcomes v2.
- **Phase 3 (at reviews, 12th & 26th):** retune weights/family priors/lexicon against real follows/reach. **Update the cloud routine trig_01Vpccac6zcW7HSVjH2zn29y's instructions** to tune HeroScore against `ig_post_metrics` (its current premise — tuning dealScore weights against site clicks — is obsolete). Until Phase 2 lands it should not open weight PRs.

## Non-goals

- No ML/embeddings/image models — keyword lexicon + tunable weights only, reviewed on the existing cadence.
- No auto-publishing without Wesley's tap — the engine suggests; the human posts.
- No Facebook-specific engine — FB stays a free cross-post (organically dead, median ~108 views; one lottery ticket did 94.9k).
