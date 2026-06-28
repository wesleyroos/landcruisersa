# Scraper architecture & off-market reconciliation

Canonical reference for how listings are scraped and reconciled. This repo runs ONE scraper fleet that serves BOTH sites — Land Cruiser SA (default) and Jimny SA (the `SCRAPE_SEGMENT=jimny` passes, routed to jimnysa via `JIMNY_*` env).

## Where each source runs (all cloud as of 2026-06-25)

| Source | Where | How |
|---|---|---|
| AutoTrader | ☁️ GitHub Actions (`autotrader.yml`, daily) | raw HTTP + **residential proxy** |
| cars.co.za | ☁️ GitHub Actions (`carsza.yml`, daily) | **headed Chrome under xvfb** + sticky proxy session (clears Cloudflare) |
| WeBuyCars / Adios / WBB | ☁️ GitHub Actions (`ingest.yml`, every 4h) | direct (datacenter-OK) |
| Jimny (all sources) | ☁️ GitHub Actions (`jimny.yml`, daily) | same scrapers, `SCRAPE_SEGMENT=jimny`, routed to jimnysa |

The Mac is no longer required for scraping (the old `local-ingest-cron.sh` is retired for LC). Cloud secrets: `PROXY_*` (×4), `R2_*` (×5), `JIMNY_*`, `INGEST_TOKEN`, `SITE_URL`.

## The proxy (`src/lib/sources/proxy.ts`)
DataImpulse residential, ZA exit, gated on `PROXY_*` env (unset → direct). `proxyFetch()` = rotating IP per request (AutoTrader, beats the per-IP rate limiter). `playwrightProxy(sessionId)` = **sticky** session (cars.co.za, holds CF clearance). Only `www.autotrader.co.za` / cars.co.za HTML is proxied — **image downloads go direct** (the CDN isn't rate-limited and images are the heavy bytes; keeps proxy bandwidth ~5–10 GB/mo against the ~5 GB plan — watch "Traffic left" in DataImpulse, top up ~$5/mo).

## Off-market reconciliation (how `off_market_at` / status='removed' gets set)
A full-catalogue crawl saw every live listing in the segments it crawled, so any DB-active listing **not** seen this run has been delisted.

- **cars.co.za** — inline ingest-time diff in `ingest-carsza.ts` (always on). Working: thousands reconciled.
- **AutoTrader + WeBuyCars** — shared `src/lib/sources/reconcile.ts`, called from `ingest-autotrader.ts` / `ingest-wbc.ts`. **DRY-RUN by default** — logs "WOULD mark N" but only POSTs removals when **`RECONCILE_OFFMARKET=1`**. Roll out per source after the dry-run counts look sane (single-digit % per cycle).
- **poll-liveness** (`poll.yml`, every 6h, BOTH sites) — per-URL liveness for WBC/wbb/adios (404 → removed). `POLL_SKIP=autotrader` (AutoTrader can't be re-fetched reliably — it's reconciled at ingest), `POLL_CAP=800` oldest-polled-first (rotates), error-isolated per listing.

**Guards (in `reconcile.ts`):** never reconcile off a partial upload (`aborted`), an incomplete discovery (`capHit`), outside the crawled **segment-scope** (prevents the 2026-06-16 mass-purge), or when >25% would be removed (**circuit-breaker** = partial scrape, not a real mass-delisting).

⚠️ **AutoTrader off-market is `capHit`-gated:** it won't reconcile until the AutoTrader crawl is complete (`capHit=0`). So scrape completeness (below) is the prerequisite.

## AutoTrader crawl resilience (2026-06-28)
The residential proxy drops the odd page mid-crawl (`TypeError: fetch failed`). The crawl now **retries a failed page then skips it and continues the model** — it does NOT abandon the whole model on one bad page (that bug truncated capture to ~40% = capHit yellow, and starved the image backfill = red). Aborts the model only if page 1 is unreadable or 6 pages fail back-to-back (a real block). `src/lib/sources/autotrader.ts` `discover()`.

## Pause toggle
`isSourceScheduled()` (`src/lib/sources/extra-config.ts`) checks the `/admin/scrapers` toggle (`site_config scraper_scheduled_<source>`) at the start of every ingest script + the AT backfills, **fail-open** (a config hiccup never silently halts scraping). Pausing a source in the admin UI now stops it in the cloud too.

## Operational learnings (2026-06-28 firefight)
- AutoTrader yellow (capHit ~40%) + AT-image-backfill red were **proxy connection flakiness** (`fetch failed` mid-crawl), **NOT** bandwidth (4.82 GB left) and **NOT** Actions billing (Jimny/carsza/WBC/Ingest all green). Fixed by the skip-and-continue resilience change.
- `poll-liveness` had been failing 100% of runs (aborted on the first network error) — fixed (error-isolation + cap + Jimny pass).
- ⚠️ **Prod migrations:** new column → `addCol` in `scripts/migrate.mjs`; new table → `CREATE TABLE IF NOT EXISTS`, or the deploy 500s.
