#!/bin/zsh
# On-demand Jimny scrape — crawl all sources for Suzuki Jimny, post to Jimny SA,
# fill full photo galleries, then rehost AutoTrader images to jimnysa's R2.
# Run from the Land Cruiser SA repo: AutoTrader blocks datacenter IPs and
# cars.co.za Cloudflare-challenges them, so both need this residential Mac.
#
#   Usage:  bash scripts/jimny-scrape.sh
#
# The daily cron (local-ingest-cron.sh) does this automatically; this is for a
# manual top-up. Adios is skipped — it's a Land Cruiser specialist with no Jimny
# stock (its adapter is gated to return 0 for a Jimny run anyway).
set -uo pipefail

REPO="/Users/wesleyroos/Developer/LandCruiserSA"
NODE="${NODE:-$(command -v node)}"
cd "$REPO"
set -a; source .env; set +a

: "${JIMNY_INGEST_TOKEN:?JIMNY_INGEST_TOKEN not set in .env}"
JURL="${JIMNY_SITE_URL:-https://jimnysa.fly.dev}"

# Every Jimny ingest runs with this prefix: Jimny segment, routed to Jimny SA.
jimny() { SCRAPE_SEGMENT=jimny SITE_URL="$JURL" INGEST_TOKEN="$JIMNY_INGEST_TOKEN" "$NODE" --experimental-strip-types "$@"; }

echo "── $(date '+%H:%M:%S') Jimny scrape → $JURL ──"

echo "[jimny] autotrader…"
jimny src/scripts/ingest-autotrader.ts || echo "[jimny] autotrader failed"

echo "[jimny] cars.co.za…"
jimny src/scripts/ingest-carsza.ts || echo "[jimny] carsza failed"

echo "[jimny] webuycars…"
jimny src/scripts/ingest-wbc.ts || echo "[jimny] wbc failed"

echo "── filling AutoTrader photo galleries ──"
BACKFILL_SEGMENTS=jimny BATCH_SIZE=120 DELAY_MS=3000 jimny scripts/backfill-at-images.ts || echo "[jimny] gallery backfill failed"

# Rehost AT-hosted images to jimnysa's R2 (AT's CDN rate-limits hotlinks → ~half
# 503). Map the JIMNY_R2_* creds onto the R2_* vars r2.ts reads.
echo "── rehosting AutoTrader images → jimnysa R2 ──"
R2_ENDPOINT="$JIMNY_R2_ENDPOINT" R2_PUBLIC_URL="$JIMNY_R2_PUBLIC_URL" R2_BUCKET="$JIMNY_R2_BUCKET" \
  R2_ACCESS_KEY_ID="$JIMNY_R2_ACCESS_KEY_ID" R2_SECRET_ACCESS_KEY="$JIMNY_R2_SECRET_ACCESS_KEY" \
  SITE_URL="$JURL" INGEST_TOKEN="$JIMNY_INGEST_TOKEN" \
  "$NODE" --experimental-strip-types src/scripts/rehost-at-images.ts || echo "[jimny] image rehost failed"

echo "── $(date '+%H:%M:%S') done ──"
