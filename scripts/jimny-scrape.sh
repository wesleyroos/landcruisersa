#!/bin/zsh
# On-demand Jimny scrape — crawl AutoTrader for Suzuki Jimny, post to Jimny SA,
# then fill full photo galleries. Run from the Land Cruiser SA repo (residential
# IP — AutoTrader blocks datacenter IPs).
#
#   Usage:  bash scripts/jimny-scrape.sh
#
# The daily cron (local-ingest-cron.sh) does this automatically; this is for a
# manual top-up.
set -uo pipefail

REPO="/Users/wesleyroos/Developer/LandCruiserSA"
NODE="${NODE:-$(command -v node)}"
cd "$REPO"
set -a; source .env; set +a

: "${JIMNY_INGEST_TOKEN:?JIMNY_INGEST_TOKEN not set in .env}"
JURL="${JIMNY_SITE_URL:-https://jimnysa.fly.dev}"

echo "── $(date '+%H:%M:%S') Jimny scrape → $JURL ──"
SCRAPE_SEGMENT=jimny SITE_URL="$JURL" INGEST_TOKEN="$JIMNY_INGEST_TOKEN" \
  "$NODE" --experimental-strip-types src/scripts/ingest-autotrader.ts || echo "[jimny] ingest failed"

echo "── filling photo galleries ──"
SITE_URL="$JURL" INGEST_TOKEN="$JIMNY_INGEST_TOKEN" BACKFILL_SEGMENTS=jimny BATCH_SIZE=120 DELAY_MS=3000 \
  "$NODE" --experimental-strip-types scripts/backfill-at-images.ts || echo "[jimny] gallery backfill failed"

echo "── $(date '+%H:%M:%S') done ──"
