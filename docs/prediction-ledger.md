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
