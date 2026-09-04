# Opening up Hilux & Fortuner listings — analysis (2026-09-04)

**The ask (Wesley, 21-Aug):** "I think I want to open up the site to start
displaying all the Hiluxes and Fortuners that we collect as well… I think it's
mostly cosmetic. I think it's already wired in. We might just have to change
the valuation page and the filters on the listings page." That session cut off
before the investigation was delivered; this completes it.

---

## 1. What's true today

**"Already wired in" is about 70% right.** The plumbing that exists:

- **Detail pages are already public for every segment** — `/listings/[slug]`
  serves Hilux/Fortuner pages today (comment in the code: "All segments are
  public"). Google has found some despite near-zero internal links.
- **Valuation already covers them** — `VALUATION_MODEL_SLUGS` includes
  hilux-gd6/d4d and fortuner-gd6/d4d; the "Value my X" CTA renders on their
  detail pages.
- **Market pages already exist** — `/market/hilux-gd6/` etc., shown as a
  second section on `/market/`, now with the live-median titles (bet P25).
- **The pipeline is healthy** — collection toggle ON for AutoTrader; liveness
  (crawl-diff for AT/Cars.co.za, get-car poll for WBC) covers the segment
  since the July starvation fix; 1,174 fresh listings ingested in the last 7 days.

What is deliberately **closed**: `/listings/` index, province pages,
`/listings/model/*` shelves, home-page stats, the listings JSON feed, alerts
(saved searches hardcode the Land Cruiser segment), and the IG engine
(correctly guarded — no change wanted there).

## 2. The inventory (prod, 4-Sep)

| | Active | Avg asking |
|---|---|---|
| Hilux GD-6 (2016+) | 4,781 | R538k |
| Fortuner GD-6 (2016+) | 2,055 | R581k |
| Fortuner D-4D (pre-2016) | 570 | R254k |
| Hilux D-4D (pre-2016) | 532 | R243k |
| **Toyota-4x4 total** | **7,947** | |
| Land Cruiser (for comparison) | 2,760 | |

Opening up would take the visible site from ~2,760 to ~10,700 listings —
**3.9×**. Photo quality is fine for cards (98.7% have 2+ photos) but only 23%
have full backfilled galleries (vs LC, which was prioritised).

## 3. The demand evidence (GSC, 28d)

- Queries containing "hilux": **7 clicks / 46 impressions**. Containing
  "fortuner": **0 clicks / 57 impressions**. Tiny — but we have almost no
  Hilux/Fortuner surface, so this measures our footprint, not the demand.
- The interesting part: **hidden Hilux detail pages are already ranking**
  (pos 6–10 for queries like "2012 toyota hilux", "2007 hilux 3.0 d4d") with
  zero internal links pointing at them. Links would lift them.
- The cautionary part: `/market/hilux-gd6/` had 448 impressions and **0
  clicks** in the 12-Aug analysis. And the head terms ("hilux for sale" is one
  of SA's biggest car queries) are owned by AutoTrader, Cars.co.za, WBC and
  Facebook — the exact opposite of the weak-SERP condition the verticals
  playbook (game viewers → classics → FJ) requires to win.

## 4. What "opening up" would actually change (the honest list)

The one-line version Wesley had in mind — flip the segment filter — touches
far more than filters:

1. **`/listings/` payload** — the page ships all rows as client-side JSON.
   3.9× the rows means a meaningfully heavier page (this page's slowness was
   already fixed once). Needs a brand filter UI + probably payload work.
2. **Site identity numbers** — home page, citable capsules, llms.txt and the
   WBC one-pager all say "N Land Cruisers". Mixing in 8k bakkies either
   inflates those claims dishonestly or forces a rewrite of every stat surface.
3. **Bet contamination** — P27 (the "/listings/ for-sale retitle", shipped
   today, review 2-Oct) measures that exact page. Changing its inventory 4×
   mid-window destroys the measurement.
4. **Brand/moat dilution** — the domain is landcruisersa.co.za; the AI-citation
   moat and the WBC pitch are both built on "the definitive Land Cruiser
   source". A Hilux shelf inside it weakens the story we're selling WBC —
   whose network pitch prices each *niche engine* separately (LCSA + Jimny at
   R30k/engine/mo; a Hilux engine is a new sellable engine, not a free add-on
   to this one).
5. **Smaller wiring** — saved-search segment, province pages, model shelves
   (hilux-gd6 etc. currently redirect), the listings feed, backfill priority.
   Ads gating (Titan) and the IG engine are already correctly guarded.

## 5. Options

**A. Full open on /listings/** — max audience, matches the market-share
instinct. But: contaminates P27, dilutes the brand the WBC deal is priced on,
and enters the one SERP where we have no edge. **Not recommended, and
definitely not before P27's 2-Oct review.**

**B. Contained vertical — `/bakkies/` (Hilux + Fortuner), the game-viewers
pattern** — a top-level page with live stats, filters and a citable capsule,
linking into the already-public detail pages; market pages link across;
llms.txt entry for the AI-citation upside; NOT in main nav, NOT in the LC
stats, `/listings/` untouched. ~Half a day of work plus payload care (8k rows
needs server-side trimming, unlike the small FJ/classics verticals). Run it as
a ledger bet (P28) with a revert path. Gets the long-tail + AI-citation upside
at ~10% of the brand risk. **Recommended if we want to act now.**

**C. Spin-out (HiluxSA/BakkieSA on its own domain, the Jimny model)** — the
strategy-consistent endgame and the version WBC would pay for as engine #3.
Real cost (domain, Fly app, IG account, weekly feeding) against an already
tight WIP limit. **Right play, wrong week — trigger it on the WBC deal
signing or option B proving demand.**

**D. Status quo** — keep collecting for valuation/market-data/WBC ammo. Free,
and loses nothing: the data asset grows either way.

## 6. Recommendation

**D now, B when there's a free half-day, C on a trigger.** Concretely: leave
`/listings/` pure at least until P27 reads out (2-Oct). If the audience-first
appetite wants an outlet before then, ship the contained `/bakkies/` vertical
as P28 — it touches no existing bet's query pool, so it can run in parallel
without muddying anything. Full-open (A) only makes sense if we decide LCSA
should become "SA's Toyota 4x4 site" — a rebrand decision, not a filter flip.
