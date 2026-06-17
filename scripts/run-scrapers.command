#!/bin/zsh
# Double-click to run the full Land Cruiser SA scraper pipeline manually.
#
# This is the one-click equivalent of the cron: it runs every ingest + the AT
# description and image backfills, writing to PROD from this Mac's residential
# IP, respecting the admin pause/extra toggles and the AutoTrader 20h marker
# (so AT can't be over-hit). All the politeness/abort protections apply.
#
# Use this when your Mac is on and you want a manual run, since the schedule
# only fires when the machine happens to be awake.

cd "$(dirname "$0")/.." || { echo "Repo not found"; exit 1; }
echo "── Running Land Cruiser SA scrapers ($(date '+%Y-%m-%d %H:%M')) ──"
echo ""
./scripts/local-ingest-cron.sh
echo ""
echo "── Done. Press Return to close this window ──"
read
