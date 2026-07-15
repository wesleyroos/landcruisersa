---
name: data-checkup
description: Run the full LCSA data checkup — pull GSC, Plausible, prod DB, and IG engine data, grade it against the prediction ledger and deal ledger, compare to the last benchmark/checkup, and write docs/checkup-YYYY-MM-DD.md. Use when Wesley asks for a data checkup, weekly review, "how are we doing", or whether experiments are hitting.
---

# LCSA Data Checkup

Produce a full-system snapshot and grade it against the ledgers. The output is
(1) a terse honest report in the terminal and (2) `docs/checkup-<today>.md`
committed + pushed. Follow the style of previous `docs/checkup-*.md` files —
tables vs the benchmark, trending HIT/MISS per prediction, demand signals,
deals snapshot, a "verdict" section.

## Context to load first

- `docs/benchmark-2026-06-22.md` — the fixed baseline
- the most recent `docs/checkup-*.md` — the previous snapshot (compare against BOTH)
- `docs/prediction-ledger.md` — every open P# with review dates + numeric bars
- `docs/deal-ledger.md` — stages + kill-or-advance dates (flag any due within 7 days)

## Data pulls (all tokens in `.env` at repo root; `set -a && source .env && set +a`)

### 1. GSC (28d) — prod report endpoint
```
curl -H "Authorization: Bearer $GSC_REPORT_TOKEN" https://landcruisersa.co.za/api/admin/gsc-summary
```
Returns totals, topQueries, contentGaps, tyreQueries, clothingQueries,
topPages, and the P3 `bounce` array (30d Plausible bounce for the 3 tracked guides).

### 2. IG engine — prod report endpoint
```
curl -H "Authorization: Bearer $REPORT_TOKEN" https://landcruisersa.co.za/api/admin/ig-outcomes
```
Returns per-post outcomes, `by_slot` (hero follows/post = P13 output metric),
`acceptance` (P13 primary), `flywheel` (followers, private-seller count), `context`.

### 3. Plausible (30d) — Stats API v1
Base `https://plausible.io/api/v1/stats`, header `Authorization: Bearer $PLAUSIBLE_API_KEY`,
`site_id=landcruisersa.co.za&period=30d`:
- `aggregate?metrics=visitors,pageviews,bounce_rate,visit_duration`
- `breakdown?property=event:page&metrics=visitors,pageviews&limit=30` → top pages
- `breakdown?property=visit:source&metrics=visitors&limit=25` → channels (Google/FB/IG/ChatGPT…)
- `breakdown?property=visit:utm_source&metrics=visitors` → ig vs ig-story vs alert
- `breakdown?property=event:props:url&metrics=visitors,events&filters=event:name%3D%3DOutbound%20Link%3A%20Click&limit=30` → outbound (aggregate by host)
- `timeseries?interval=date&metrics=visitors` → sum into weeks; state plainly whether growth is accelerating/flat

### 4. Prod DB — Fly SSH + Node (⚠️ two gotchas)
No `sqlite3` binary in the container; run Node with the app's own driver.
**All `created_at` columns are unix-epoch INTEGER seconds** — `datetime('now')`
string comparisons silently return 0 rows. Use `strftime('%s','now') - 30*86400`.

Pattern: write a query script, then
```
B64=$(base64 < script.js | tr -d '\n')
fly ssh console -a landcruisersa -C "/bin/sh -c 'echo $B64 | base64 -d | node -'"
```
with `require('/app/node_modules/better-sqlite3')('/data/db.sqlite',{readonly:true})`.

Standard counts (30d unless noted):
- **P7 accounts:** external users (exclude `%@grodigital.co.za`/`%@landcruisersa.co.za`) split by verified/opted-in; `favorites` + `saved_searches` totals; alerts fired (`last_notified_at IS NOT NULL`); alert click-backs (`visit_events WHERE utm_source='alert'`)
- **P8 valuation:** `valuation_requests` count; with email/phone; `valuation_certificates` (⚠️ timestamp column is `issued_at`) → capture rate
- **D4/finance:** `finance_leads` count
- **P10 AI:** `ai_referrals` count + by source + `client_id`-carrying rows since 2026-07-07 (clock: needs ≥25; beacon undercounts ~3× vs Plausible — Plausible for volume, DB for the join)
- **P11 search:** `search_queries` count / distinct client_id / `result_count=0`; adoption ≈ searchers ÷ /listings/ Plausible visitors (KEEP bar 8%)
- **Handoffs (the B2B product):** `click_events` grouped by `source` — ⚠️ source holds the PORTAL NAME (`autotrader`,`wbc`,`carsza`,`adios`…) plus `whatsapp`/`call`/`email`/`finance_calc`/`reveal_number`; portal rows = handoffs
- **Outbound:** `outbound_clicks` by `dest_host` (check partner hosts, e.g. titansecure); `dealer_offers` count + distinct listings (P17)

## Grading rules

- Grade every open P# **against its pre-registered numeric bar** — trending
  HIT / MISS / PARTIAL / too-early. Call misses plainly; never rationalise
  (the ledger's whole point). Respect gates (e.g. P7 %s ungraded below volume
  gates) and the business-brain drift guard (small n = directional).
- Deal ledger: list any kill-or-advance date due within 7 days and what the
  pre-committed action is. Update statuses Wesley reports in conversation.
- Repeat demand signals (classics/FJ45, clothing, LC300, affiliate flows):
  track how many checkups in a row they've appeared unactioned.
- Verdict section: keep-or-pivot on the current strategy, argued from the
  data, ending with THE one highest-leverage action (per the exit mandate:
  rand + signed deals over pageviews; deals > builds when both compete).

## Wrap-up

1. Write `docs/checkup-YYYY-MM-DD.md` (style of previous checkups).
2. Update `docs/deal-ledger.md` / `docs/prediction-ledger.md` with anything learned.
3. `git add` the docs + commit + push (per Wesley's git flow — no asking).
4. Terminal report: lead with the verdict and any deal deadlines, then the
   traffic table, prediction reads, and top pages. Flag data-quality issues
   (broken beacons, undercounting) loudly — silent instrumentation rot has
   bitten before (P10).
