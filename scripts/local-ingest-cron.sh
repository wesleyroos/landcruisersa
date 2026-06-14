#!/bin/zsh
# Scheduled local-only ingests — run by launchd every 6h while the machine is awake.
# These sources can't run on GitHub Actions:
#   - cars.co.za: Cloudflare challenges (needs real headed Chrome)
#   - AutoTrader: blocks datacenter IPs
#
# Install:   launchctl load ~/Library/LaunchAgents/za.co.landcruisersa.carsza.plist
# Uninstall: launchctl unload ~/Library/LaunchAgents/za.co.landcruisersa.carsza.plist
# Logs:      ~/Library/Logs/lcsa-carsza.log

set -uo pipefail

REPO="/Users/wesleyroos/Developer/LandCruiserSA"
NODE="/Users/wesleyroos/.nvm/versions/node/v22.22.0/bin/node"

cd "$REPO"
set -a; source .env; set +a

# Default SITE_URL (prod) applies — this populates the live site
echo "── $(date '+%Y-%m-%d %H:%M:%S') starting local ingests ──"
"$NODE" --experimental-strip-types src/scripts/ingest-autotrader.ts || echo "[cron] autotrader failed"
"$NODE" --experimental-strip-types src/scripts/ingest-carsza.ts     || echo "[cron] carsza failed"
# AT listings ingest with empty descriptions (AT blocks our servers); fill them
# here from this residential IP, right after the AT ingest that created them.
"$NODE" --experimental-strip-types src/scripts/backfill-at-descriptions.ts || echo "[cron] at-desc-backfill failed"
echo "── $(date '+%Y-%m-%d %H:%M:%S') local ingests done ──"
