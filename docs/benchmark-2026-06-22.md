# Benchmark & Session Log — 2026-06-22

A dated snapshot to compare against later. Pairs with `prediction-ledger.md`
(per-bet baselines + the 2026-07-20 review). The "Prediction ledger review" cloud
routine (trig_01EDNN64NPNrMxomm4R6P1Pd) auto-scores P1–P4 on 2026-07-20.

> **Context / caveat:** the domain `landcruisersa.co.za` went live ~11 Jun 2026, so
> Plausible's "30d" is really ~11–12 days of data. Treat all numbers as a small,
> early baseline — directional, not statistically robust.

---

## Traffic — Plausible (as of 2026-06-22)

| Window | Visitors | Pageviews | Bounce | Avg visit |
|---|---|---|---|---|
| Last 30d | 434 | 1,921 | 52% | 5m10s |
| Last 7d | 291 | 1,219 | 51% | 5m05s |

Steady ~40 visitors/day floor since the domain switch; no bot spikes.

**Top sources (30d):** Direct 160 · Google 154 · Instagram 83 · Bing 15 ·
Facebook 13 · **ChatGPT 9** · DuckDuckGo 3 · Google Gemini 1. (AI-referred is the
hero metric — small but present; tracked first-party from 2026-06-17.)

---

## Search — Google Search Console (28d to 2026-06-19)

- **Totals:** 93 clicks · 4,840 impressions · 1.9% avg CTR
- **Biggest impression magnet:** `4x4 megaworld` — 2,261 impr, 0.4% CTR, pos 5.8
  (navigational to *their* brand; not really winnable — do NOT chase it)
- **Top non-brand queries:** land cruiser rental SA (36 impr, #3.5) · land cruiser
  clothing (22, #5.6) · land cruiser sa (26, #5.5) · **land cruiser tyre size (285
  impr, 0.7% CTR, #3.2)** ← the P1 opportunity
- **Content gaps (high impr, page 2, ~no clicks):** 4x4 mega world (112) · toyota
  land cruiser 300 price SA (74, #10.1) · land cruiser tires (51, #12.1) · land
  cruiser roof tent (29, #11.7) · fj45 for sale SA (20) · all land cruiser models (20)
- **Per-model tyre-size long-tail (P4 baseline):** ~46 combined impressions across
  79/80/100/200/300 variants; ~1–2 clicks. (Cluster pages are brand-new — expect
  slow indexing.)

**Bounce on the three Tier-3 pages (P3 baseline):** tyres 93% · rooftop 55% ·
300-price 50%.

---

## Conversions — DB (see /admin/analytics)
Conversion baseline (valuation_requests + finance_leads) was reset clean 2026-06-17,
so pre-17-Jun conversion data is void. Current counts live on /admin/analytics
(valuations / enquiries / finance leads, 7d & 30d). Not duplicated here — read them
there at review time.

---

## What shipped this session

**Data & instrumentation**
- Sold-price capture: `sold_price` column + admin field + "Sold" group on /admin
  (first comp logged: 2009 79 single cab, asked 549k→475k, sold R400k — enter on prod)
- **GSC integration** into /admin/analytics (queries, content gaps, tyre panel) —
  service-account auth, dependency-free (`lib/gsc-summary.ts`)
- Read-only report endpoint `/api/admin/gsc-summary` (GSC + per-page bounce),
  guarded by `GSC_REPORT_TOKEN` — lets the cloud routine auto-score the ledger
- **Prediction ledger** (`docs/prediction-ledger.md`) + cloud routine scoring P1–P4 on 2026-07-20
- Partner-referrals readout on /admin/analytics (from `partner_clicks`)

**Content / SEO (the bets)**
- **P1** — tyres hub retargeted for "tyre size" intent (title/lead/FAQ)
- **P2** — 300-price + rooftop-tent repackaged to climb to page 1
- **P3** — `PostCTA` in-content CTAs on the 3 top guides (kill the 93% bounce)
- **P4** — per-model tyre-size cluster: 5 spokes (79/80/100/200/300) + hub-and-spoke linking

**Quality / correctness**
- Tyre specs **fact-checked vs wheel-size.com** and corrected: 300 = SA grades
  GX-R/ZX/GR-S (265/65R18 on 18", 265/55R20 on 20"); 200 = GX 285/65R17 / VX·VX-R 285/60R18
- Real per-model **photos** (hero + inline) on all 5 spokes (79s credited to
  @arwald_extreme; uploaded via `scripts/upload-tyre-size-images.mjs`)
- 4x4 Mega World **doesn't sell tyres** → CTAs reframed to suspension + fitment
- UTM + `rel="sponsored"` on partner outbound links (referral evidence base)
- Fixed PostCTA button contrast (article link style was bleeding in)
- Bull-bar guide hero swapped from a Hilux → real LC 100 with a bull bar

**Active bets (review 2026-07-20):** P1 tyre-size CTR (0.7%→≥3%) · P2 300-price ≤8 /
roof-tent ≤9 / clicks ≥6 · P3 tyres bounce 93%→≤80% · P4 per-model tyre impr ~46→≥90.

---

## Outstanding / notes
- Sold price R400k for the 79 single cab still to be entered on prod (admin → Sold).
- 80 & 100 tyre specs match Wesley's check + common knowledge but were not
  independently web-verified this session.
- Orphaned old Hilux image `images/posts/land-cruiser-bull-bar-buyers-guide.jpeg`
  in R2 (harmless; delete on a future cleanup).
- No commercial relationship with 4x4 Mega World yet (they don't know) — UTM data
  is building the eventual pitch.
- Next data-driven threads (parked): apparel cluster (/shop/), rental/hire,
  formalising the Mega World referral.
