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
