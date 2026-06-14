# Land Cruiser SA — Positioning & Moat

*Investor/partner conversation collateral. Last updated: 12 June 2026.*

## One-liner

Land Cruiser SA is the market data layer for Land Cruisers in South Africa: every Cruiser for sale in the country, aggregated across every major platform, with prices tracked daily.

## The core claim nobody else can make

**Cross-platform market truth.** When AutoTrader shows a buyer "R69 000 below market average," that average is computed from *AutoTrader's own stock only*. Our Market Position panel computes the same comparison across **AutoTrader + WeBuyCars + Cars.co.za + specialist dealers + private sellers** — the entire visible market. A single-portal player structurally cannot replicate this without indexing its competitors.

The same asymmetry applies to everything downstream:

| Capability | Single portal (e.g. AutoTrader) | Land Cruiser SA |
|---|---|---|
| Price vs market | Own stock only | Whole visible market |
| Supply counts | Own stock only | Whole market (~1,850 active) |
| Price-drop detection | Own stock only | Every platform, recorded permanently |
| Price history dataset | Internal, unpublished | Accruing daily since June 2026, published |
| Niche depth | Generalist (all makes) | 100% Land Cruiser: best-in-SA coverage of one high-value, high-passion segment |

## Why the niche focus is a feature, not a limitation

- Land Cruisers are SA's highest-retention, highest-passion 4x4 segment — strong prices (R450k–R2.2m typical), buyers who research heavily, and a real community.
- Being *the* destination for one segment wins SEO and AI-search citations that a generalist can't defend page-for-page ("Land Cruiser 79 price South Africa" should always be us).
- The playbook is repeatable: the aggregation + price-tracking + market-data engine is segment-agnostic. Land Cruisers prove it; adjacent verticals (Defender, Hilux, G-Wagen…) are expansion options, each with the same moat mechanics.

## The data moat (compounds daily, can't be backfilled)

1. **Price history** — every asking-price change across every platform, recorded permanently (`price_events`). A competitor starting later can never recover the history they didn't witness. This powers: price-drop badges, per-vehicle price history, market-trend pages, and (as depth accrues) time-on-market and price-realisation analytics.
2. **Demand signal** — which models/listings get views, reveals, and contact actions, tracked first-party with admin traffic excluded.
3. **Self-healing supply** — 5 sources ingest on schedule, self-report health, and flag their own coverage gaps (the scraper health matrix has already caught real blind spots twice).

## Distribution flywheel (built, running)

Scrapers find cars → tracker spots price drops → scoring engine picks the daily Instagram post (demand × hook × rotation) → one-click post → `/ig` bio-link page catches the traffic → funnel measures views→reveals→contacts → a scheduled agent reviews outcomes biweekly and tunes the picker via PR. Human involvement: one post click per day, one PR review per fortnight.

## Monetisation paths (in sequence)

1. **Finance lead-gen** — "get finance" CTA on ~1,850 listings; SA vehicle-finance referrals pay R1–2k+ per funded deal. Trigger: ~500 genuine listing views/week.
2. **Dealer pay-per-lead / subscriptions** — we already aggregate dealer stock and send them buyers; "claim your listings, receive the WhatsApp/call/email leads" (all lead events already tracked per listing).
3. **Featured placement** for private sellers and dealers.
4. **The dataset itself** — SA's only Land Cruiser price index; licensing/insights potential as depth grows.

## Traction markers (update before each conversation)

- Active listings: ~1,850 (from 791 pre-aggregation expansion, June 2026)
- Sources: 5 platforms, automated, self-monitoring
- Price events: accruing since 11 June 2026
- Organic social already #2 traffic channel; market pages drawing organic search within 24h of launch
- Full-funnel tracking live: views → contact reveals → WhatsApp/call/email leads, per listing and per model

## Market coverage data (for "how much of the market do you have?")

*Sources: Mordor Intelligence SA Used Car Market; Wikipedia/SimilarWeb on AutoTrader SA; AutoTrader SA NADA reports (2025).*

- **AutoTrader** — SA's #1 automotive marketplace (SimilarWeb category leader): ~130k listings searchable, ~70–80k vehicles for sale, **11M monthly visits**; sold ~34k used vehicles/month (Sept 2025).
- **Cars.co.za** — #2, ~74k listings.
- **WeBuyCars** — major, data-rich, JSE-listed; consolidating share.
- We aggregate **all three dominant platforms** + two Land Cruiser-specialist dealers (Adios, We Buy Bakkies). For Land Cruisers specifically, that is effectively the **entire online listed market**.
- **Measured penetration** (live on /admin/scrapers): Cars.co.za 100% of its reported per-model total; per-source counts and pagination-cap monitoring for the rest. Out of scope: private off-platform sales (Facebook, word-of-mouth) — unmeasurable for anyone.
- Pitch line: *"We don't sample the market — we mirror it. On SA's #1 and #2 car marketplaces we capture ~100% of Land Cruiser stock, refreshed continuously."*
