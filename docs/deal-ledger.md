# Deal Ledger

Partnership/B2B pipeline — the channel that has actually produced LCSA's momentum
(every major opportunity so far came from a relationship, not the consumer funnel).
Same falsifiable discipline as `prediction-ledger.md`, but for deals: each entry has a
**stage**, the **one next action**, a **value hypothesis**, and a **kill-or-advance date**
so threads either progress or get consciously dropped — never drift.

**Stages:** Lead → Conversation → Proposal → Pilot → Signed → Live · (or Killed)

**Traction scoreboard (the real metric at ~40 visitors/day — not pageviews):**
- First rand from any loop: **R0** (as of 2026-06-23)
- Signed B2B agreements/integrations: **0**

---

## D1 — We Buy Cars (WBC) ⭐ highest-leverage

- **Stage:** Conversation (warm — met 2026-06-23)
- **Who:** Wynand (Chief Digital Officer) + a data scientist. Intro via **Tersia** (runs post-sale + F&I at WBC; also the catalyst for [[project-jimnysa]]).
- **Their context (from the meeting):** ~**8M pageviews/month**; JSE-listed; data-rich; **explicit 5-year goal to overtake AutoTrader.** AI agents already bought 2,800 cars for them (ITWeb) — tech-forward.
- **What they signalled:** they don't mind us scraping ("you'd drive traffic to us"); offered access to their **stock API** + **sales API**; said our most valuable assets are the **name/domain, look & feel, and niche depth** — NOT our traffic (at 8M vs our ~1,900 pageviews/mo, our traffic is immaterial to them → their interest is brand + data + the repeatable playbook).
- **API intel (from our own `wbc` scraper, `src/lib/sources/wbc.ts`):**
  - Stock API = `appgateway.webuycars.co.za/website-elastic-backend/api/search` + `/get-car/{stock}` (Elastic; full vehicle records). We already ingest it, but it's PoW-challenged + ~50-req rate-limited → **official access removes that friction.**
  - Sales API = the lead-into-funnel rail we don't have = **the trackable-attribution mechanism that makes lead-gen compliant with [[project-monetization-philosophy]].**
- **Value hypotheses (rank order):**
  - **A. Trackable lead routing** — ingest stock via API; enquiries route through their sales API with attribution → auto-tracked commission per lead/sale. (Solves the "can't track/get paid" reason we've refused lead-gen.)
  - **B. Sell-side sourcing feed** — WBC *buys* cars; we have motivated private Cruiser sellers. Feed them → pay-on-success sourcing fee. (Bigger, JSE-listed version of [[project-dealer-sourcing-fee]].)
  - **C. Sold-price data exchange** — our cross-platform asking + price history ↔ their transaction/sold data. Breaks the valuation engine's ~68% in-band ceiling + feeds [[project-book-of-life-msure]]. The strategic prize.
- **⭐ Acquisition thesis (the real exit angle):** WBC is a JSE-listed consolidator who wants to beat AutoTrader. AutoTrader's structural weakness = it only sees its own stock; **we see the whole market + are AI-search-citable + have a proven niche-vertical playbook (Jimny proves repeatability).** LCSA = the niche-vertical template + cross-platform data layer for their AutoTrader war. **Structure every deal to increase integration/dependency → make acquisition the natural endpoint.** Their 8M pageviews = the distribution rail for a valuation / Book-of-Life product.
- **Next action:** send Wynand a short follow-up proposal structured A+B+C with the acquisition frame implicit; explicitly request (1) stock-API sandbox access, (2) what the sales API attributes + pays, (3) appetite for a seller-sourcing feed, (4) sold-data exchange. Advertising ("how to buy with WBC") stays the easy-yes sweetener, not the headline.
- **Kill-or-advance:** send proposal by **2026-06-27**. ADVANCE = API sandbox access granted OR a technical follow-up scheduled by **2026-07-18**. Else downgrade to "advertising-only" and reassess.

---

## D2 — mSure / Motus (Book of Life)

- **Stage:** Conversation (warm — Wesley's father-in-law is **CFO of mSure**, a Motus arm)
- **Value hypothesis:** Data IN (proprietary SA vehicle data carVertical can't get — Motus dealer service records, mSure claims/write-offs, TransUnion/Lightstone) + Distribution OUT (B2B2C: engine serves mSure underwriting/claims + Motus dealers as a per-car VAP). Sidesteps the traffic constraint; a B2B contract + proprietary data >> a lead-gen site for exit. See [[project-book-of-life-msure]].
- **Next action:** build the one-page concept + a mock Book-of-Life report layout; ask FIL the three scoping questions (what data they can expose / appetite: pilot vs supply vs JV / which pain he'd pay to solve today).
- **Kill-or-advance:** one-pager + mock to FIL by **2026-07-11**. ADVANCE = he names a data source he can expose OR a pain he'd pilot.

---

## D3 — Gys Pitzer (dealer sourcing fee)

- **Stage:** Pilot (deal #1 in flight)
- **Value hypothesis:** Flat **R10k/car**, pay-on-success spread (dealer offer R500k → seller quoted R490k → R10k to Wesley). Proves the sell-side loop closes. See [[project-dealer-sourcing-fee]].
- **In flight:** Jared's 2024 Meano V8 → contact Jurie (manager, Silverlakes). Process agreed in person; needs physical inspection before commit.
- **Next action:** close deal #1 (inspection → purchase → fee); get the R10k terms in writing.
- **Kill-or-advance:** deal #1 closes or is declared dead by **2026-07-15**. NOTE: WBC angle B may supersede/augment this with a bigger buyer — don't over-invest here if WBC moves.

---

## D4 — Vehicle-finance partner (buyer-side)

- **Stage:** Lead (build shipped; no partner signed)
- **Value hypothesis:** R1–2k per funded deal; the only surface that monetizes *scraped* stock (finance CTA on all ~2,358 priced LC listings). See [[project-revenue-loops]].
- **⚠️ Philosophy gate:** only pursue partners offering **trackable self-serve attribution** (the WBC sales-API model is the template). Do NOT sign a "we email leads, you invoice us" arrangement — that's the leaky lead-gen [[project-monetization-philosophy]] forbids.
- **Next action:** identify 1–2 SA finance partners with an affiliate/attribution API; outreach.
- **Kill-or-advance:** a partner identified + contacted, or this surface parked, by **2026-07-20**.

---

## D5 — Ghost (immobiliser) — tracked in prediction-ledger P6

- **Stage:** Monitoring (content live; outbound clicks tracked)
- **Gate:** pursue only as a self-serve trackable affiliate, never chased lead-gen. See [[project-ghost-referral]] + `prediction-ledger.md` P6 (review 2026-07-20; ≥1 outbound click = go/no-go).

---

*Review cadence: alongside the 2026-07-20 prediction-ledger review. Update stage + scoreboard whenever a deal moves.*
