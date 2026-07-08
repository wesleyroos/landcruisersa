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
- **⭐ WARM OPENING MOVE (lead with this, NOT the API proposal):** they suggested Wesley write an article on **Faan van der Walt's (CEO) ~50-Land-Cruiser collection** parked at the WBC Silverlakes branch (one of them is Wynand's). This is the ideal first move — flatters the two decision-makers via the CEO's personal passion, showcases LCSA's actual unique asset (niche brand + AI-citability + storytelling), and creates a warm in-person touchpoint (the shoot) where the business conversation can happen organically. **Reciprocity: give the article first, then ask.** Treat as flagship content (real photography + interview Faan; Wynand's car as a personal angle). ⚠️ Get sign-off from Wynand/Tersia before publishing; do NOT publish exact location/security details (50 valuable Cruisers at a known site — frame that sensitivity *to them* as protecting their interests).
---

### 📋 D1 WORKING PROPOSAL (v1 — refine in person; pitch AFTER the Faan article)

**The one-line pitch:**
> *Community-built, niche make/model **growth engines** that feed WeBuyCars' ecosystem — the flanking play to take on AutoTrader.*

**⭐ The gold line (the centrepiece — lead with this):**
> *Self-improving, instrumented growth engines — each one runs experiments, watches how it performs (AI citations, search, conversions), and feeds that back into what content and features to build next. The engine gets better on its own.*
> (Word choice matters: **engines, not hubs.** A hub is a place; an engine does work and compounds — which is exactly the "compounding effect into our ecosystem" WBC said they want.)

**Strategic premise (why WBC needs this):** To overtake AutoTrader in 5 years, WBC can't only own the market, the distribution and the traffic (it largely does). It needs to own the **surrounding ecosystem** — fringe, brand/model-specific growth engines that *compound* traffic, trust and leads into the WBC funnel over time. AutoTrader is a static generalist marketplace; its structural blind spots are **niche authority** and **AI-search citability**. A portfolio of trusted niche engines attacks exactly those.

**The product — a portfolio of self-improving growth engines.** Each engine is a brand/model-specific platform combining useful-info/buyer content, live market + valuation data, and listings — and crucially it *improves itself* (the gold line above). Engines (illustrative): Land Cruiser SA ✅ live, Jimny SA ✅ live, then GWM/Haval / Chinese marques, Land Rover/Defender, etc. **Two are already running — that's the proof, not a promise.**

**Three pillars (what's actually being sold — sell all three, honestly):**
1. **Trusted niche consumer brands** that own the buyer relationship in passion segments — the thing a backend-data company can't conjure (and what WBC said they valued: name, look/feel, niche depth).
2. **AI-search citation strategy** — engineered to be the *cited* answer in ChatGPT/Perplexity/Google AI for make/model buyer questions, capturing buyers **upstream** of Google and AutoTrader. The open field where a focused authority structurally beats a generalist; WBC's own catalog is backend and never cited.
3. **The self-improving engine (the moat is in the methodology)** — *each engine runs experiments, watches how it performs (AI citations, search, conversions), and feeds that back into what content and features to build next. The engine gets better on its own.* This is the **methodology/IP** that makes the playbook repeatable (engines 3–8 are more instrumented growth machines, not just more content) — and it speaks WBC's data-forward language (they brought a data scientist; they run AI agents).
   - ⚠️ **HONESTY GUARDRAIL (from LOCKED [[project-business-brain-strategy]]):** sell the **methodology + rigour + early signal**, NOT proven results. We are ~2 weeks in; first predictions grade **2026-07-20**; zero graded outcomes yet. ✅ Say: *"falsifiable experiments — every change logs a numeric prediction graded vs Search Console/Plausible; framework live, first results land 2026-07-20; AI citations already 0→~10 in <2 weeks."* ❌ Don't say: *"our AI already optimises us and it's working"* — a data scientist will ask for the lift, and there isn't one yet. Overclaiming a thin dataset is the exact credibility trap the memo warns against.

**Deal structure (the shape Wesley converged on — exit-aligned, NOT a services contract):**
- **Wesley OWNS the portfolio.** WBC funds and distributes it. (Do NOT let WBC own it + pay Wesley to run it — that's a vendor/employment outcome that contradicts [[project-exit-mandate]] + [[project-monetization-philosophy]] and sells the asset at the bottom of its value curve.)
- **Commercial = base retainer + performance, with an escalating buy-out option:**
  - **Base retainer** — funds build + run of the platforms (de-risks Wesley's time/capital so he doesn't build the whole portfolio on his own risk; he's already 2 engines in to anchor it).
  - **Performance** — per attributed buyer lead + per sourced car WBC buys (via the sales API attribution rail / sourcing feed). Ties pay to value delivered; uncaps upside; defensible to a data-driven buyer. (Avoid a flat *per-platform* fee — it perversely rewards spinning up platforms over making each perform, and caps Wesley's upside while scaling his cost.)
  - **Escalating buy-out option** — the elegant exit ramp Wesley designed: as performance scales, the retainer+performance ("rent") rises until it's **cheaper for WBC to buy the assets than to keep renting.** ⚠️ For this to actually *force* an acquisition (not just trigger a retainer renegotiation), bake in a **pre-agreed buy-out right priced as a MULTIPLE of the run-rate performance fee** — so the better it performs, the higher *both* rent and buy-out climb (self-scaling, preserves Wesley's upside, makes "just buy it" the rational end state).
  - **Exclusivity is what the retainer pays for** — exclusive routing: buyers → WBC stock, sellers → WBC sourcing. Without exclusivity WBC would just keep enjoying the free traffic Wesley already sends, so this is the lever that justifies paying at all.
- **Ownership retained until buy-out** — there must be an asset for them to buy; this is what makes the exit ramp real.

**What WBC provides:** funding (retainer), **stock API** access (drops the PoW/rate-limit friction), **sales API** attribution (confirm mechanics — see API intel above), access to **sold/transaction + M&M catalog data** (one-directional, powers the valuation/Book-of-Life layer), and the exclusivity counterpart.

**What WBC gets:** attributed buyer leads + sourced sellers (their *core* business is buying cars), an ecosystem moat AutoTrader can't replicate, the AI-citation channel, and — the strategic prize — **the repeatable playbook/IP** to stand up new verticals on data they already hold.

**Two design tensions to resolve (their data scientist WILL raise these):**
- **Listings/redirects:** you can't "point all listings to WBC" — you scrape the whole market and WBC doesn't have every car. Resolution: keep the **comprehensive whole-market content + valuation + data as the traffic magnet** (don't cripple comprehensiveness — it's what earns citations); route only the **monetisation** (high-intent buyers → WBC stock; sellers → WBC sourcing).
- **AutoTrader exposure:** openly repurposing scraped AutoTrader listings to funnel buyers to their direct rival, as a *WBC-sponsored* initiative, is a sharper legal provocation than quiet aggregation. Route via our own data/valuation layer, not verbatim competitor listings; expect their legal team to probe this.

**Perceived-independence guardrail:** pitch **"powered by / in partnership with WBC," NOT WBC-branded.** A chunk of the value is the independent-authority halo (a buyer and an LLM trust "Land Cruiser SA" more than "WeBuyCars Land Cruiser microsite"). Visible WBC ownership could kill the goose — this also conveniently supports Wesley keeping ownership.

**Open items to confirm with WBC:** (1) sales API attribution mechanics (the unverified piece); (2) sold/M&M data availability + terms; (3) appetite for exclusivity; (4) own-vs-sponsor stance (push for sponsor/fund, Wesley owns); (5) budget reality for a retainer.

**Recommended path:** Faan article (gift) → pitch the vision in person at Silverlakes → **paid pilot on LCSA + Jimny** (prove the funnel math: leads + sourced cars, tracked) → that result sets the retainer + the buy-out multiple → scale to engines 3–8 on WBC funding → escalating buy-out.

---

- **STATUS (2026-06-27): Wesley visited Silverlakes** (walked in, name opened the door; head mechanic **Wade** gave the tour). ~30 Cruisers on site of ~50 total — a *living* collection (Faan drives/rotates them). Spans FJ40 → FJ45 → 60/FJ62 → 80 → 100 (4.2TD) → 200/300 → modern 70-series incl. 70th Anniversary editions + FJ Cruiser + a mystery black "50 Years" SWB. **Wynand's car = beige 79 double cab (plate VLT332GP), a 2007 single→double-cab conversion** (the personal angle).
- **TWO-ARTICLE PLAN (agreed with Wade):**
  - **Article 1 — recon "first look"** ✅ LIVE but **UNLISTED** `src/content/posts/inside-the-webuycars-land-cruiser-collection.mdx` (draft:false + **unlisted:true** → reachable by direct URL only: noindex, and absent from nav/sitemap/archive/homepage/sidebars/IG-poster). House voice; Wesley's own photos, GPS-stripped, on R2; FAQ schema; NO location/security, NO unverified rarity claims; Wynand-79 engine + black "50 Years" flagged as to-confirm. **URL: /useful-info/inside-the-webuycars-land-cruiser-collection/ — Wesley shares this directly with Wynand for sign-off; it doubles as the warm follow-up + secures Article 2.** (New `unlisted` flag added to the posts schema — reusable for future private previews.)
  - **Article 2 — flagship** (later): proper shoot + Faan interview + verified provenance (incl. the black "50 Years" — likely the 2007 Venezuela 50th-anniversary 70, ~300 made, UNCONFIRMED). The bigger brand piece + in-person touchpoint where the WBC vision gets pitched.
- **Next action:** (1) Wesley reviews Article 1 (`npm run dev`), then send to Wynand/Tersia for sign-off + to line up the Article 2 shoot/interview. (2) The proposal above is raised in person at the Article 2 shoot, not before. Advertising stays the easy-yes sweetener.
- **Kill-or-advance:** article reply sent within days (strike while they're excited); shoot scheduled. API/data follow-up after the article lands. ADVANCE = article published + warm reception OR API sandbox/technical follow-up by **2026-07-18**.
- **⭐ STATUS (2026-06-29): Tersia endorsed the community-engine concept + the OFFERING is now formalised.** Her steer changes the structure: **NOT WBC-owned** (they must stay *impartial*) → **"sponsored by WeBuyCars" + a monthly fee per engine.** Wesley keeps ownership (exit-aligned); this refines the "escalating buy-out" framing in the working proposal above — the asset is now a *recurring multi-engine sponsorship* (arm's-length acquisition possible later, not the lead structure). **One-pager BUILT:** `docs/wbc-proposal/wbc-sponsorship-proposal.{html,pdf}` (2-page, LCSA-branded).
  - **Commercial:** Founding **R30,000/engine/mo** (LCSA + Jimny, 12-mo founding term) · Standard **R45,000/engine/mo** (each new engine) · optional **R3,000 per private seller sourced that WBC buys** · **exclusivity** = sole automotive-marketplace sponsor across the network. (Anchors, adjustable.)
  - **Impartial-by-design:** independent editorial + market data (whole market, honest) = trust/citability; WBC = named sponsor + exclusive commercial funnel (buyers→WBC stock, sellers→WBC sourcing).
  - **Included per engine:** independent platform (listings + market/price data + valuation + community/IG) · content engine (AI-citable guides + monthly market reports) · "Powered by WeBuyCars" branding · exclusive buyer+seller funnel · self-improving methodology · monthly reporting.
  - **Rollout:** Phase 1 = LCSA + Jimny (live proof) → Phase 2 = expand to agreed makes/models quarterly.
  - **Next:** send the one-pager to **Tersia** (the internal champion) to circulate; the technical asks (stock-API access, sales-API mechanics, sold/M&M data) fold in once the sponsorship is agreed in principle. See memory [[project-webuycars]].
- **STATUS (2026-07-07):** Wesley asked Tersia whether she's happy for him to follow up with Wynand directly (Faan article sign-off still pending since ~2026-06-29). Kill-or-advance 2026-07-18 unchanged.

---

## D2 — mSure / Motus (Book of Life)

- **Stage:** Conversation (warm — Wesley's father-in-law is **CFO of mSure**, a Motus arm)
- **Value hypothesis:** Data IN (proprietary SA vehicle data carVertical can't get — Motus dealer service records, mSure claims/write-offs, TransUnion/Lightstone) + Distribution OUT (B2B2C: engine serves mSure underwriting/claims + Motus dealers as a per-car VAP). Sidesteps the traffic constraint; a B2B contract + proprietary data >> a lead-gen site for exit. See [[project-book-of-life-msure]].
- **Next action:** build the one-page concept + a mock Book-of-Life report layout; ask FIL the three scoping questions (what data they can expose / appetite: pilot vs supply vs JV / which pain he'd pay to solve today).
- **⏸️ PARKED by choice (2026-07-07):** Wesley explicitly deferred — "don't want to do anything with mSure yet." Not a silent miss of the 2026-07-11 date; revisit when WBC/D6 resolve (family-adjacent deal, no urgency decay).

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

## D6 — Auto Investments North Coast (dealer buyer-leads) 🟢 INBOUND

- **Stage:** Conversation (inbound — they contacted US, 2026-07-02 site enquiry + 2026-07-03 call)
- **Who:** **Blair** (recon@autoinorthcoast.co.za), Auto Investments **North Coast** branch (Ballito/KZN); group has ~25+ branches nationally. Claims: top-rated dealership on AutoTrader; dealer principal (= owner?) briefed and keen.
- **What they want:** list their Land Cruiser stock with us + we send buyers; **pay-per-converted-buyer** ("spotter" fee — they already pay spotters "a couple hundred thousand rand a month" and R200k/mo on social ads). Sold 2 Cruisers last month = **R5m** (~R2.5m avg — premium builds; claim to supply Zambian government).
- **What we already have (verified in prod DB 2026-07-03):** we ALREADY carry the whole group via scrapers — ~270 lifetime listings across ~25 branches; **North Coast alone ~20 active LCs on autotrader source + ~6 via carsza**. Traffic sent to the group so far: 33 views, 3 outbound clicks, 1 finance-calc open — honest baseline, don't overpromise volume.
- **⚠️ Philosophy gate ([[project-monetization-philosophy]]):** "pay when it converts, if we can track" is EXACTLY the leaky lead-gen shape — conversion is observable only by THEM. Mitigants that make it acceptable: (1) inbound + existing spotter-payment culture (the rail exists), (2) WE capture every lead first (form on our site, not a deeplink) with a per-lead reference ID → papered record + audit right + we can survey buyers ourselves, (3) written spotter agreement BEFORE the first lead (learned from Gys/D3), (4) prefer hybrid: small per-lead floor + larger per-sale success fee, or a flat monthly "featured dealer" fee (the WBC-sponsorship shape in miniature).
- **⚠️ WBC conflict (D1):** the WBC offering sells *exclusive* buyer-funnel routing. Keep this deal **non-exclusive + 30-day terminable**; frame internally as the **paid pilot that proves + prices the funnel math** for the network pitch ("dealers already come to us and pay"). Do NOT sign anything exclusive with Auto Investments.
- **Build (minimum, not a "dealer section"):** flip their listings from external deeplink → on-site lead capture + forward-with-reference; pull stock direct from their site (bypasses AutoTrader). **Site audit 2026-07-03: EASY.** autoinorthcoast.co.za = custom multi-tenant Django, server-rendered, robots allows all, full sitemap.xml (64 vehicles, ~16 LC-family incl. 9× LC79), and every `/vehicle/<slug>/` page embeds clean schema.org/Vehicle JSON-LD (price/year/mileage/fuel/images/spec) — sitemap → JSON-LD parse, <70 req/day, no headless browser. Same codebase runs every group branch domain (e.g. autoinvestments.co.za) → one generalized crawler covers the whole group. Leads POST to their own Django endpoints (no 3rd-party CRM). No official feed though — still ask Blair to bless the pull + for a feed/DMS export as the durable option.
- **Next action:** WhatsApp Blair (he asked for it); discovery call — what they pay spotters per car, feed access, then paper the fee.
- **⭐ BUY-BOX (learned 2026-07-08):** Auto Investments **passed** on the Francois 2023 LC79 D/C 4.5 V8 (a desirable but relatively STOCK late-model V8). Blair: they only want **newer builds with lots of extras** — i.e. heavily-kitted premium modified builds (matches their "insane builds" self-description + the [[project-ig-weight-tuning]] finding that kitted 79s are the hero product). So AI's buy-box = **modified/kitted late-model 79s & premium builds, NOT stock vehicles.** ⟹ the sourcing loop is a **MATCHING problem**: each dealer has a distinct buy-box; a seller's car must be routed to the dealer whose box it fits (sending a stock 79 to a builds-specialist = guaranteed no). The Francois car's right home = a clean-stock buyer (Gys already offered R950k). Capture each dealer's buy-box as we learn it — declines ARE the data. (Do NOT build a structured buy-box matching engine yet — n=1 dealer criteria, WIP limit, drift guard; instrument informally first.)
- **STATUS (2026-07-08):** (1) private-seller vehicle Wesley sent Blair (first cross-loop sell-side→dealer event) → **DECLINED** (wrong buy-box, see above) — not a failure, it taught us AI's criteria + the matching insight; (2) commercials still owed. Ball still in Blair's court on the fee. Draft the spotter agreement NOW so there's zero lag.
- **Kill-or-advance:** written fee terms + stock feed access agreed by **2026-07-24**, else park.

---

## D7 — Dealer spotter outbound motion (data-backed pipeline)

- **Stage:** Lead (asset built 2026-07-07; **armed when D6's commercials land** — Blair's number prices the funnel first)
- **Value hypothesis:** replicate the D6 shape across 2–3 LC-specialist dealers so no single counterparty's silence stalls the motion, and "dealers already pay us" becomes a fact (not a claim) in the WBC pitch. The product is real: **123 buyers handed to portals free in the 30d to 2026-07-07** (~500/mo by Sep at current growth).
- **The asset:** `/admin/dealers` ranks every dealer by stock + demand we already send them, with a per-dealer copy-pitch opener ("we sent you N buyers last month"). Agreement template ready at `docs/spotter-agreement/` (attorney review before first signature).
- **Guardrails:** max 2–3 pilots (WIP limit per [[project-strategy-reframe]]); ALL non-exclusive + 30-day terminable (WBC exclusivity conflict); leads captured on OUR site with reference IDs (the D6 mitigants); WBC branches excluded from outreach (they're D1).
- **Candidates (from /admin/dealers, 2026-07-07):** Adios 4x4 (13 handoffs/30d — already receiving the most buyers), Slabbert Motors (48 seventy-series in stock), Halfway Toyota Honeydew (114 LCs, 33 seventies), Kloof Car Sales / Koos and Mike (specialist stock + handoffs). Vintage Cars SA for the classics angle (221 views on one R2.5m 6x6).
- **Next action:** WAIT for D6 commercials → then pitch the top 2 non-conflicting candidates within a week, using the copy-pitch opener + agreement template. Falsifiable bet logged as prediction-ledger **P16**.
- **Kill-or-advance:** if D6 hasn't produced a priced fee by 2026-07-24 (its kill date), decide whether to pitch anyway with our own anchor (R10k/car from D3) or park.

---

## D5 — Anti-hijack partner: Ghost → **Titan Secure** (pivoted 2026-07-08)

- **Stage:** Proposal / Outreach sent — **Victor email sent 2026-07-08**.
- **⚠️ PIVOT:** Ghost (Reniel) went COLD after multiple unanswered emails → switched to **Titan Secure** (titansecure.co.za), a WARM lead via Wesley's FIL Brad Salters (mSure/Motus; a Motus Toyota dealership uses it). Contact = **Victor / Henno Victor Claassens, Titan National BD Manager** (victor@titansecure.co.za) — the partnerships decision-maker.
- **Why Titan > Ghost:** multi-layer system (smart engine-lock + remote fuel-cut + GPS tracking + AI tamper detection + SOS + 24/7 armed response), insurer-recognised (incl. MyToyota Insurance), warm intro to the right person, subscription model = better advertiser economics. Full detail in [[project-ghost-referral]].
- **Done:** both theft guides reworked to feature Titan (Ghost fully removed) + Titan imagery added; Titan UTM links tracking outbound clicks. Content-first complete.
- **Value hypothesis:** sponsored placement (~R3.5k/mo) and/or a trackable referral (Titan has a "Become a Partner" page). Gate (per [[project-monetization-philosophy]]): trackable affiliate or own-inventory advertising only — never chase-to-invoice.
- **Next / kill-or-advance:** await Victor's reply; **follow up by ~2026-07-15** if silent. ADVANCE = a call booked / partnership terms discussed.

---

*Review cadence: alongside the 2026-07-20 prediction-ledger review. Update stage + scoreboard whenever a deal moves.*
