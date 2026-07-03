# Prediction Ledger

A running log of traffic/conversion bets: what we changed, what we predicted, and
what actually happened. The point is discipline — isolate one variable, predict a
number, then score it against Google Search Console / Plausible after the data
lands. Wins compound; misses teach. This is the proof that LCSA's growth is a
repeatable machine, not luck (it matters for the exit story).

How to score: pull the metric from `/admin/analytics` (GSC section) on the review
date, compare to baseline, mark HIT / MISS / PARTIAL, and write the lesson.

---

## P1 — Tyre-size CTR harvest

- **Opened:** 2026-06-22
- **Review on:** 2026-07-20 (GSC lags ~3 days; this gives a clean 28-day window post-change)
- **Surface:** `/useful-info/land-cruiser-tyres-buyers-guide/`
- **Thesis:** We rank #3.2 for "land cruiser tyre size" with 285 impressions but only
  0.7% CTR. The ranking is fine; the *packaging* loses the click. The old title read
  as a long buyer's guide and the page led with a chatty intro instead of the answer.
- **Change (isolated to CTR — no internal-linking/routing in this change so the variable stays clean):**
  - metaTitle → "Land Cruiser Tyre Sizes by Model: 79, 100, 200, 300 & Prado"
    (leads with the exact query + names the high-demand per-model variants)
  - metaDescription rewritten to promise the chart, not a long read
  - Body now leads with a direct answer + the size table under an H2 matching the
    query ("Land Cruiser Tyre Sizes by Model") — aimed at the featured snippet
  - Added FAQ entries (→ FAQPage schema) for 100 / 200 / 300 / 80 Series tyre sizes
    to capture the per-model long-tail seen in GSC
- **Baseline (28d to 2026-06-19, GSC):**
  - "land cruiser tyre size": 285 impr · 2 clicks · 0.7% CTR · pos 3.2
  - "land cruiser tires": 51 impr · 1 click · 2.0% CTR · pos 12.1
  - All tyre/wheel queries combined: ~93 clicks site-wide / 4,840 impr (whole site)
- **Predictions (28d window, review 2026-07-20):**
  1. "land cruiser tyre size" CTR rises from 0.7% → **≥3%** (≥9 clicks vs 2 on similar impressions). *Primary.*
  2. Average position holds or improves (≤3.2) — packaging change shouldn't hurt rank.
  3. At least **2 new per-model tyre-size queries** (100/200/300 series) appear with impressions, from the new FAQ sections.
- **Result:** _pending 2026-07-20_
- **Lesson:** _tbd_

---

## P3 — Conversion: in-content CTAs on the top guides (Tier 3)

- **Opened:** 2026-06-22
- **Review on:** 2026-07-20
- **Surfaces:** the three highest-traffic guides — tyres, 300-price, rooftop-tent.
- **Thesis:** These guides pull traffic but leak it (tyres bounces at 93%). The
  sidebar CTA is generic and below the fold on mobile. Add a contextual in-content
  CTA (`PostCTA.astro`) right where the reader gets their answer, routing to a
  revenue surface. Internal links so the session continues (drops bounce) AND
  funnels to conversion: tyres/rooftop → 4x4 Mega World partner hub + listings;
  300-price → valuation tool + 300-series listings.
- **Metric:** bounce rate (Plausible) = the clean proxy for "did the reader take a
  second step." Scored from the report endpoint's new `bounce` array.
- **Baselines (30d to 2026-06-22, Plausible):**
  - tyres: **93%** bounce (42 visitors) ← the big leak
  - rooftop: 55% bounce (31 visitors)
  - 300-price: 50% bounce (10 visitors — small sample, low confidence)
- **Predictions (review 2026-07-20):**
  1. *(PRIMARY)* tyres bounce drops from 93% → **≤ 80%**.
  2. rooftop bounce drops from 55% → **≤ 48%**.
  3. 300-price bounce drops from 50% → **≤ 45%**. *(Caveat: tiny sample; treat as directional.)*
- **Result:** _pending 2026-07-20_
- **Lesson:** _tbd_

---

## P2 — Content-gap harvest (300 price + roof tent)

- **Opened:** 2026-06-22
- **Review on:** 2026-07-20
- **Surfaces:** `/useful-info/land-cruiser-300-price-south-africa/` and `/useful-info/best-rooftop-tent-for-a-land-cruiser/`
- **Thesis:** Two pages rank on page 2 for queries with real demand — we already have
  the content, we're just not matching the exact query in the title/meta. Repackage
  for relevance to climb onto page 1. (Different pages + different queries from P1, so
  measurement stays clean. Deliberately did NOT re-touch the tyres page, to protect P1.)
- **Changes (isolated to on-page relevance — no routing/internal-linking):**
  - **300 price:** metaTitle now leads with "Toyota" (the query includes it) + "(2026)";
    added `updatedAt` for freshness. Query: "toyota land cruiser 300 price south africa".
  - **Roof tent:** page had no metaTitle/metaDescription (SERP showed a bare title +
    excerpt) and never used the "roof tent" variant — added both, with "roof tent" in
    the description. Query: "land cruiser roof tent".
- **Baselines (28d to 2026-06-19, GSC):**
  - "toyota land cruiser 300 price south africa": 74 impr · 1 click · 1.4% CTR · pos 10.1
  - "land cruiser roof tent": 29 impr · 1 click · 3.4% CTR · pos 11.7
- **Predictions (28d window, review 2026-07-20):**
  1. "toyota land cruiser 300 price south africa" moves onto page 1 — **position ≤ 8** (from 10.1). *(Caveat: page was only ~1 week old at baseline, so some lift may be natural ageing, not the title change.)*
  2. "land cruiser roof tent" moves onto page 1 — **position ≤ 9** (from 11.7).
  3. Combined clicks for the two queries rise from 2 → **≥ 6**.
- **Result:** _pending 2026-07-20_
- **Lesson:** _tbd_

---

## P4 — Per-model tyre-size content cluster (Tier 2)

- **Opened:** 2026-06-22
- **Review on:** 2026-07-20 *(early checkpoint — new pages need time to index/rank; expect a leading indicator, not a final verdict. Re-arm a later review if promising.)*
- **Surfaces:** 5 new spoke pages — `/useful-info/land-cruiser-79-tyre-size/`,
  `-80-series-`, `-100-series-`, `-200-series-`, `-300-series-tyre-size/` — plus the
  existing tyres hub, now linking to each (hub-and-spoke).
- **Thesis:** GSC shows a per-model long-tail ("79 tyre size", "100 series tyre size",
  etc.) that the single hub page only partly captures. Dedicated, genuinely distinct
  per-model pages (accurate specs from the hub table + real model context: cab split,
  IFS vs solid axle, 18"/20" rims, TPMS) should capture more of that long-tail and
  rank for each model's query. Specs sourced from the hub table Wesley maintains — he
  should sanity-check them.
- **Metric:** per-model tyre-size queries in the GSC `tyreQueries` array (those naming
  a model — 79/80/100/200/300 — and tyre/tyre-size). Measured by combined impressions,
  distinct query count, and combined clicks.
- **Baseline (28d to 2026-06-19, GSC — the long-tail before the cluster existed):**
  - ~46 combined impressions across the per-model variants (79≈14, 100 variants≈27, 200≈3, 300≈1, 80≈1); ~1–2 combined clicks; only a couple of distinct queries with real presence.
- **Predictions (review 2026-07-20):**
  1. Combined per-model tyre-size impressions grow from ~46 → **≥ 90**.
  2. At least **4 distinct** per-model tyre-size queries (across 79/80/100/200/300) show impressions.
  3. The cluster earns **≥ 3 combined clicks** on per-model tyre-size queries (from ~1–2).
- **Result:** _pending 2026-07-20_
- **Lesson:** _tbd_

---

## P5 — Rental article: rename + retarget to "rental"

- **Opened:** 2026-06-22
- **Review on:** 2026-07-20
- **Surface:** rental guide — **slug changed** `hiring-a-land-cruiser-in-sa` →
  `land-cruiser-rental-south-africa` (301s in middleware from both old slugs); title +
  metaTitle + metaDescription retargeted from "hiring" to "rental"; dead link removed
  (landcruiserhire.com), Britz dropped (no Land Cruisers), 5 verified operators swapped in.
- **Thesis:** the page already ranks #3.5 for "land cruiser rental south africa" at ~14%
  CTR despite "hiring" in the slug/title. Matching the URL + title to the converting
  query should hold/strengthen it long-term, and the content is now genuinely the best
  rental resource (accurate, current operators).
- **Risk:** changing the URL of the best-ranked page carries short-term ranking
  volatility even with a clean 301 — watch for a dip that should recover.
- **Metric/where:** GSC `topQueries`, query `land cruiser rental south africa`.
- **Baseline (28d to 2026-06-19):** 5 clicks · 36 impressions · 13.9% CTR · pos 3.5.
- **Predictions (review 2026-07-20):**
  1. Position holds top-5 — **≤ 4** (no 301 damage).
  2. Clicks grow from 5 → **≥ 8**.
  3. No drop below pos 6 for "land cruiser rental" / "land cruiser for hire" either.
- **Result:** _pending 2026-07-20_
- **Lesson:** _tbd_

---

## P6 — Vehicle-theft / security content cluster (cold-start citation bet)

- **Opened:** 2026-06-23
- **Review on:** 2026-07-20 *(early checkpoint — brand-new pages, slow indexing; expect a leading indicator, not a verdict. Re-arm a later review if promising.)*
- **Surfaces:** new cluster — hub `/useful-info/land-cruiser-theft-hijacking-protection-south-africa/` + spoke `/useful-info/immobiliser-vs-tracker-south-africa/` (hub↔spoke linked).
- **Thesis:** Unlike P1–P5 (which retarget existing impressions), this is a **cold start**: we had zero content and zero GSC footprint on vehicle theft/security. The bet is that genuine macro demand (SA ~60 hijackings/day; Land Cruiser/Prado/Fortuner on the 2026 target lists) plus citable, structured content (FAQPage schema, comparison table) will *create* a footprint where none existed — and that the credited, UTM-tagged Ghost outbound links generate measurable clicks. The outbound-click number is the **go/no-go signal** for any Ghost commercial conversation.
- **Metric/where:** GSC `topQueries`/`contentGaps` for theft/hijack/immobiliser/tracker terms; Plausible "Outbound Link: Click → ghostsouthafrica.co.za".
- **Baseline (2026-06-23):** ~0 GSC impressions on theft/security/immobiliser/tracker queries (no prior content); 0 outbound clicks to ghostsouthafrica.co.za.
- **Predictions (review 2026-07-20, early checkpoint):**
  1. The cluster earns **≥ 40 combined GSC impressions** on theft/security/immobiliser/tracker queries (from ~0).
  2. **≥ 2 distinct** such queries show impressions.
  3. **≥ 1 outbound click** to ghostsouthafrica.co.za recorded in Plausible. *(The precondition for Ghost outreach.)*
- **Monetization gate (per LOCKED monetization philosophy):** even if clicks materialise, only pursue Ghost as revenue if it's a **trackable self-serve affiliate** — do NOT chase Ghost to negotiate/pay a referral (that's the leaky lead-gen the philosophy forbids). Absent a self-serve program, the cluster stays a pure authority/citation asset.
- **Result:** _pending 2026-07-20_
- **Lesson:** _tbd_

---

## P7 — User accounts + favourites + saved-search alerts (engagement loop)

- **Opened:** 2026-06-29
- **Review on:** 2026-07-27 *(4-week first checkpoint — tiny-sample BY DESIGN; judge on raw counts and re-arm a later review. Every % below is noise until ≥50 events at that step.)*
- **Surface:** the whole accounts feature shipped 2026-06-29 — passwordless (magic-link) sign-in, save (heart) on home/grid/detail, saved searches, and the daily price-drop / sold / new-match alert emails. Alert email links tagged `?utm_source=alert&utm_campaign=…`.
- **Thesis:** Traffic is the binding constraint and there is **no on-site checkout** (a Cruiser is a R300k–1.5m considered, mostly off-site/offline purchase). So this feature's job is NOT direct sales — it is to (a) build an **owned, opted-in email list** (an asset LCSA doesn't have today, and an exit-diligence asset), and (b) **manufacture return visits** by turning anonymous one-time visitors into registered, returning, warmer leads via alert emails. Manage on raw weekly counts, not conversion %.
- **Baseline (2026-06-29 launch):** 0 verified users, 0 favourites, 0 saved searches, 0 alert click-backs (excluding internal test signups `@grodigital.co.za` / `@landcruisersa.co.za`). Traffic ~250–350 visitors/wk.
- **Benchmark basis (adversarially calibrated DOWN for a cold-start niche site — not vendor warm-list figures; research workflow 2026-06-29):** magic-link completion 35–55%; save adoption <1–2% of visitors; triggered-alert open 35–45% reported / CTR 3–8%; return-visit ≈ the click-back. Big-brand subscriber-vs-non-subscriber "lift" stats are unpublished/fabricated — do not borrow them.
- **Predictions (4-week window, review 2026-07-27) — PRIMARY metrics are raw counts:**
  1. *(PRIMARY — owned list)* **≥ 5 verified users**, growing week-over-week (not flat). `SELECT count(*) FROM users WHERE verified_at IS NOT NULL AND email NOT LIKE '%@grodigital.co.za' AND email NOT LIKE '%@landcruisersa.co.za';`
  2. *(saves loop alive)* **≥ 8 saves** (favourites + saved searches combined). `SELECT (SELECT count(*) FROM favorites) + (SELECT count(*) FROM saved_searches);` — **Red flag:** 0 saves in week 1 with >150 visitors → discoverability, or the signup-wall is killing intent at the click.
  3. *(drop-off — secondary, gated)* magic-link **verification ≥ 40%**, graded ONLY if ≥10 signups; below that report the raw fraction and treat as directional. `SELECT sum(verified_at IS NOT NULL) AS verified, count(*) AS signups FROM users WHERE email NOT LIKE '%@grodigital.co.za' AND email NOT LIKE '%@landcruisersa.co.za';` — **Red flag:** <30% → deliverability (SPF/DKIM/DMARC, Gmail Promotions/spam), not disinterest.
  4. *(re-engagement — the actual point of the feature; gated on alert VOLUME)* **≥ 1 alert click-back** once alerts have fired ≥10×; long-run target ≥ 4% click-back per send. `SELECT count(*) FROM visit_events WHERE utm_source='alert';` (+ Plausible utm_source=alert). Alerts fired: `SELECT (SELECT count(*) FROM favorites WHERE last_notified_at IS NOT NULL) + (SELECT count(*) FROM saved_searches WHERE last_notified_at IS NOT NULL);` *(May be ~0 early simply because few saved cars have changed yet — that's volume, not failure.)*
  5. *(secondary)* **≥ 60% of signups opt in** to alerts. `SELECT sum(consent_at IS NOT NULL) AS opted_in, count(*) FROM users WHERE email NOT LIKE '%@grodigital.co.za' AND email NOT LIKE '%@landcruisersa.co.za';`
- **Pre-registered failure hypothesis (so a miss isn't rationalised away):** if saves ≈ 0 after 4 weeks despite >600 visitors, the prime suspect is the **account-gate** — you must sign up to save, which compounds two low-probability gates (intent-to-save × willingness-to-sign-up). Pre-committed next experiment if so: **guest-save** (capture email on save, defer the full profile). Real accounts were a deliberate product choice; this is the data-triggered fallback, not a default.
- **Most-watched (manage the feature on these, raw counts, vs the clean 2026-06-17 conversion baseline):** net-new verified emails/wk · saves/wk · alert click-backs/wk · downstream finance_calc / valuation / enquiry events attributable to alert click-backs.
- **Result:** _pending 2026-07-27_
- **Lesson:** _tbd_

---

## P8 — Valuation certificate CTA promotion (lead capture)

- **Opened:** 2026-06-30
- **Review on:** 2026-07-28
- **Surface:** valuation result card (`ValuationTool.astro`).
- **Thesis:** The valuation tool is heavily used (~27 valuations/7d) but barely
  captures leads — only **1 of 36** in the 30d to 2026-06-30 left contact details.
  The actual lead-capture surface (the certificate, which gates name+phone+email)
  was the *secondary*, low-key CTA; the primary was "List my car — free". Most
  valuation users are curious, not ready to list, so they bounced without a capture.
- **Change:** Promote the certificate to the **primary** CTA, reframed as a clear
  value-exchange ("📄 Get your free valuation certificate"); demote "List my car —
  free" to a secondary text link. (Also shipped same-session, not the variable:
  condition now moves the estimate; anonymous client_id for dupe-grouping.)
- **Metric:** valuation→certificate-lead capture rate (certificates issued ÷
  valuations), from the DB. Baseline ~1/36 ≈ **3%**.
- **Prediction (review 2026-07-28):** capture rate rises from ~3% → **≥ 8%**.
- **Caveat:** certificate still asks for name+phone+email+consent (real friction);
  prominence helps but the value-exchange framing is what closes it.
- **Result:** _pending 2026-07-28_
- **Lesson:** _tbd_

---

## P9 — Listing-template SEO: structured title + meta + image filter

- **Opened:** 2026-06-30
- **Review on:** 2026-07-30 (Ahrefs crawl credits reset; re-crawl picks up all fixes)
- **Surface:** `src/pages/listings/[slug].astro` + `src/lib/photos.ts` (shared
  listing template — hundreds of pages each).
- **Thesis:** Ahrefs flagged the listing template for the bulk of the audit:
  214 "title too long", 538 "meta description too short", 88 "missing", plus
  ~168 placeholder images and a sitewide footer linking to 4 dead routes (the
  latter inflated a "links to broken page" issue across **2,604** pages).
- **Change:** title now built from fields (collapses doubled years, length-capped);
  meta description is an always-present, unique ~120-160 char structured sentence;
  `no-image-car.svg` placeholders filtered everywhere. Footer/terms/301 fixes
  shipped just prior. All verified live 2026-06-30.
- **Metrics (two gauges):**
  1. **Ahrefs (confirmation):** the above warning counts should fall to ~0 on the
     30 Jul re-crawl, EXCEPT ~543 raw `img.autotrader` hotlinks (left intentionally;
     rehost handles those) and a few edge-case long titles.
  2. **GSC (the one that matters):** listing-page (`/listings/<slug>/`) impressions
     + CTR over the 28d after vs the 28d before. Better metas/titles → better SERP
     snippet → higher CTR.
- **Prediction (review 2026-07-30):** Ahrefs title/meta/placeholder warnings down
  ≥ 90%; AND listing-page average CTR in GSC up vs the prior 28d (directional —
  listing pages are low-volume, long-tail, so call a flat/down CTR a MISS).
- **Caveat:** listing pages get little organic search vs the guides, so the GSC
  signal may be thin; the Ahrefs cleanup is the high-confidence half.
- **Result:** _pending 2026-07-30_
- **Lesson:** _tbd_

## P10 — Citation → conversion measurement (AI-referred visitors)

- **Opened:** 2026-07-01
- **Review on:** 2026-09-01 (or once ≥ 25 AI-referred visitors carry a client_id,
  whichever is first — AI traffic is only ~9/mo, so a clean read will take time).
- **Surface:** `ai_referrals`, `click_events`, `finance_leads`, `valuation_requests`
  (shared `client_id` = `lcsa_vcid`); shown in `/admin/analytics` → "LLM citations
  — first-party" → the "Citation → conversion" line.
- **Thesis:** First-party data (n=9, all ChatGPT, 23-28 Jun) showed 8/9 AI
  citations landing on individual **listings** (mostly Prado 2.8GD VX-R; one
  listing cited 5×), not guides — and a live ChatGPT test confirmed it shortlists
  listings + cites our market-data page for pricing. If that intent is real, AI
  visitors should **engage at a high rate** (contact/external click, finance lead
  or valuation). We couldn't measure it before (no join key between a referral and
  a later action); the client_id instrumentation now makes it measurable.
- **Change:** Added `client_id` (the anonymous per-browser `lcsa_vcid`) to the
  AI-referral beacon and to every listing contact/external/finance beacon + the
  finance-lead POST, so a citation can be joined to a later conversion.
- **Metric:** citation→conversion rate = converted ÷ referred (from /admin/analytics),
  plus which action dominates (WhatsApp/call/email vs "View on <source>" external).
- **Prediction (review 2026-09-01):** once ≥ 25 AI-referred visitors carry a
  client_id, **≥ 40%** will have taken a valuable action — i.e. AI traffic engages
  better than typical browse traffic; AND the **dominant action is an external
  "View on source" click**, confirming that AI is sending high-intent buyers we
  then hand off (often to WeBuyCars) for free.
- **Caveat:** below the ≥5-graded-outcomes signal bar and tiny volume; referrer
  stripping under-counts referrals. Treat the first read as directional
  baseline-building, not proof (per the locked business-brain drift guard).
- **Result:** _pending 2026-09-01_
- **Lesson:** _tbd_

## P11 — Natural-language vehicle search (keep/drop experiment)

- **Opened:** 2026-07-01 (ships after local review — this entry is the success bar)
- **Review on:** 2026-09-01 (needs to be live + accrue usage first)
- **Surface:** `search_queries` table (every query + parsed filters + result count +
  client_id); `VehicleSearch` on the homepage (→ /listings/?params) and listings
  page (live client-side filter). Admin "search insights" view still to build.
- **Thesis:** Fiddling dropdown filters is friction. Letting a buyer type
  "200 series under R700k, under 100k km" is faster AND captures intent in their
  own words. Every query is first-party intent data; a **zero-result** query is a
  demand gap (we don't have that vehicle) — a dealer-sourcing/bird-dog signal.
- **Change:** Rules-based NL parser (instant, client-side, no LLM) → the existing
  filter shape; logs every search.
- **Metrics:** (a) **adoption** = searches ÷ listings-page sessions; (b)
  **conversion lift** = engagement rate (contact click / valuation, joined via
  client_id) of searchers vs non-searchers; (c) **demand gaps** = count of
  zero-result searches.
- **Prediction / keep-drop rule (review 2026-09-01):** KEEP if EITHER adoption
  ≥ 8% of listings sessions OR ≥ 15 distinct zero-result demand-gap queries
  surfaced — AND searchers engage at ≥ the non-searcher rate. DROP if adoption
  < 5% AND < 5 demand-gap signals AND no conversion lift after ≥ 40 searches.
- **Caveat:** low traffic will make adoption noisy; the rules parser misses odd
  phrasing (LLM fallback is a deferred V2); needs the admin insights view built
  before the review to actually read (a)–(c).
- **Result:** _pending 2026-09-01_
- **Lesson:** _tbd_

## P12 — Model pages: live market strip (query→page flip + citability)

- **Opened:** 2026-07-02
- **Review on:** 2026-08-27 (8 weeks)
- **Surface:** `/listings/model/[model].astro` — all 9 model pages.
- **Thesis:** For "[model] for sale south africa" queries, Google serves the
  HOMEPAGE instead of the dedicated model page (seen 2026-07-02: "toyota land
  cruiser 80 series for sale south africa" → homepage at #2). The model pages
  were thin: a bare listing grid with no market context and (until today) a
  broken "Seriess" meta. Meanwhile our own AI-referral data shows LLMs cite
  exactly two shapes: listings and market-data pages. A model page combining
  live inventory + live price stats is the best possible page for both Google
  and LLM citation on these commercial queries.
- **Change:** Added a live market strip (median asking, range, avg mileage,
  supply, 30d price drops) computed from active listings; meta description now
  carries median + range; CTAs to per-model valuation, market data, and a
  pre-filled "alert me" saved-search; price-drop badges on cards; newest/price
  sort. (Same session: fixed the "Seriess" meta bug.)
- **Metrics (GSC, via the report endpoint):** for "[model] for sale"-type
  queries — which LCSA page Google serves, model-page impressions, and CTR.
  Baseline 2026-07-02: homepage ranks for these; model pages near-invisible.
- **Prediction (review 2026-08-27):** within 8 weeks, GSC shows the model pages
  (not the homepage) as the served page for ≥ 3 of the "[model] for sale south
  africa" query family, AND combined model-page impressions ≥ 3× their July
  baseline. Directional secondary: an AI referral lands on a /listings/model/
  page (first ever).
- **Caveat:** low query volume per model → noisy; 8 weeks may be short for
  Google to re-pick pages; the strip only renders with ≥ 2 priced listings
  (thin models like 80-series hover near that line).
- **DECISION DUE AT THIS REVIEW — model-page consolidation (explicit, do not
  skip):** LCSA currently runs FOUR surfaces per model — `/models/X/` (fact-sheet
  guide), `/listings/model/X/` (shelf: stock + market strip), `/market/X/` (live
  data), `/valuation/X/` (tool) — which splits intent, risks self-cannibalisation
  in Google, and leaves the shelf pages nearly unreachable by human navigation
  (audited 2026-07-02: only the bottom-of-/listings/ pills, guide links and the
  sitemap point at them; the nav and homepage tiles go to the fact-sheet guides).
  Using this review's GSC data on WHICH page Google actually serves per
  "[model] …" query family, decide ONE of:
  (a) **Consolidate** — one canonical page per model (live stats + stock + guide
      link), 301 the losers, rewire nav/homepage tiles to it;
  (b) **Keep the split** but fix navigation/internal anchors to vote for the
      shelf pages; or
  (c) **Demote** — Google keeps preferring homepage/market → accept it and stop
      investing in the shelf pages.
  Record the choice + rationale in Result/Lesson below.
- **Result:** _pending 2026-08-27_
- **Lesson:** _tbd_

## P13 — IG Hero Engine v2 (acceptance rate + follows per post)

- **Opened:** 2026-07-03
- **Review on:** 2026-08-03 (one month of daily suggestions + the ~early-Aug Meta re-export)
- **Surface:** IG post-suggestion engine (`src/lib/post-suggestions.ts`, spec `docs/ig-engine-v2-spec.md`)
- **Thesis:** v1 ranked by dealScore (cheap vs market) — the wrong objective. Wesley
  ignored 100% of its suggestions and hand-picked "impressive muscly builds", which
  outperformed (Jun 2026 Meta export: top 3 posts — all kitted R1.6M–R2.6M 79s —
  drove 130 of 160 monthly follows). v2 ranks by HeroScore (mod lexicon +
  kitted-build premium + 70-series prior) in a hero-dominant slot mix, and pulls
  real per-post IG metrics into `ig_post_metrics` daily.
- **Baseline (Jun 4 – Jul 1 2026):** suggestion acceptance ≈ 0% · 6.2 follows/post
  avg (160/26) · listings 1.85 follows/1k views.
- **Predictions (review 2026-08-03, via `/api/admin/ig-outcomes` acceptance block):**
  1. **Acceptance rate ≥ 50%** — the published post matches the day's #1 suggestion
     on at least half the suggested days. *Primary: this is the whole test.*
  2. Hero-slot posts average **≥ 10 follows/post** (needs the `follows` metric to be
     available via the insights API; if not exposed, judge on saves+reach vs the
     Jun baseline instead).
  3. The insights sync runs clean (≥ 25 of 30 days with snapshots, backfill matched
     most legacy posts).
- **Caveat:** acceptance is also a UX/habit question, not purely a ranking one — if
  Wesley never opens the morning email the rate reads falsely low; check that before
  blaming the scorer.
- **Result:** _pending 2026-08-03_
- **Lesson:** _tbd_
