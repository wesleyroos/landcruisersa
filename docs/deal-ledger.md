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
- **Who:** Wynand **Beukes** — **CDO, just appointed deputy CEO** (ran WBC digital/data since 2018; 2026 CIO Award nominee) + a data scientist. Intro via **Tersia** (post-sale + F&I at WBC; also the catalyst for [[project-jimnysa]]). → near-top decision-maker access.
- **Their context (from the meeting):** ~**8M pageviews/month**; JSE-listed; data-rich; **explicit 5-year goal to overtake AutoTrader.** AI agents already bought 2,800 cars for them (ITWeb) — tech-forward.
- **What they signalled:** they don't mind us scraping ("you'd drive traffic to us"); offered access to their **stock API** + **sales API**; said our most valuable assets are the **name/domain, look & feel, and niche depth**.
- **⚠️ What they value is NARROW (Wesley's 2026-06-23 realisation):** WBC **also scrapes the whole market** and attaches the **TransUnion M&M code** to every listing to build their "**We Buy Cars catalog**" (cataloguing every vehicle + its canonical trade/retail value). So it is **NOT our traffic** (8M vs ~1,900/mo), **NOT our scraping tech**, and **NOT our cross-platform data** (they have all three). What's left that they can't trivially reproduce: (1) the **consumer-facing niche brand + trust**, (2) **AI-search citability** (being the *cited* answer — their catalog is backend, never cited), (3) the **repeatable niche-vertical playbook** (Jimny proves it). ⚠️ This means the "unique cross-platform data moat" in `positioning.md` holds vs single-portal AutoTrader but **NOT vs a data-rich aggregator like WBC** — positioning.md needs that caveat.
- **API intel (from our own `wbc` scraper, `src/lib/sources/wbc.ts`):**
  - Stock API = `appgateway.webuycars.co.za/website-elastic-backend/api/search` + `/get-car/{stock}` (Elastic; full vehicle records). We already ingest it, but it's PoW-challenged + ~50-req rate-limited → **official access removes that friction.**
  - Sales API = **UNVERIFIED — open question, not a found fact.** WBC's term from the meeting + Wesley's guess (syndicate stock to other platforms → route enquiries back to WBC's funnel). No public docs/endpoint found (web search + our scraper only cover the *stock* side). *Hypothesis to confirm:* if it gives trackable lead attribution, it's the rail that makes lead-gen compliant with [[project-monetization-philosophy]]. **Confirm mechanics directly with WBC — do NOT probe their endpoints to find out.**
- **Value hypotheses (rank order):**
  - **A. Trackable lead routing** — ingest stock via API; enquiries route through their sales API with attribution → auto-tracked commission per lead/sale. (Solves the "can't track/get paid" reason we've refused lead-gen.)
  - **B. Sell-side sourcing feed** — WBC *buys* cars; we have motivated private Cruiser sellers. Feed them → pay-on-success sourcing fee. (Bigger, JSE-listed version of [[project-dealer-sourcing-fee]].)
  - **C. Sold/catalog data ACCESS (one-directional, not an exchange)** — WBC already scrapes + M&M-catalogs the market, so our asking data gives them little. The value flows TO us: their **actual sold/transaction prices + M&M trade/retail catalog** (which scraping cannot produce) → breaks the valuation engine's ~68% in-band ceiling + powers [[project-book-of-life-msure]]. Negotiate access / pay for it; don't frame as a trade of our (non-unique) data.
- **⭐ Acquisition thesis (the real exit angle):** WBC is a JSE-listed consolidator who wants to beat AutoTrader. Since WBC already has the data/scrape/catalog, the thesis is NOT "unique data" — it's **the trusted, AI-cited, consumer-facing niche-brand layer + the repeatable playbook to build more verticals** on top of data they already hold (Jimny proves repeatability). That's the consumer demand-gen front-end a backend-data company can't easily conjure. **Structure every deal to increase integration/dependency → make acquisition the natural endpoint.** Their 8M pageviews = the distribution rail for a valuation / Book-of-Life product.
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
