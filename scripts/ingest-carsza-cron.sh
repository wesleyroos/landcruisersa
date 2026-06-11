#!/bin/zsh
# Scheduled cars.co.za ingest — run by launchd every 6h while the machine is awake.
# Cars.co.za sits behind Cloudflare, so this must run locally (drives real Chrome);
# the other sources run on GitHub Actions.
#
# Install:   launchctl load ~/Library/LaunchAgents/za.co.landcruisersa.carsza.plist
# Uninstall: launchctl unload ~/Library/LaunchAgents/za.co.landcruisersa.carsza.plist
# Logs:      ~/Library/Logs/lcsa-carsza.log

set -euo pipefail

REPO="/Users/wesleyroos/Documents/Projects/LandCruiserSA"
NODE="/Users/wesleyroos/.nvm/versions/node/v22.22.0/bin/node"

cd "$REPO"
set -a; source .env; set +a

# Default SITE_URL (prod) applies — this populates the live site
echo "── $(date '+%Y-%m-%d %H:%M:%S') starting carsza ingest ──"
"$NODE" --experimental-strip-types src/scripts/ingest-carsza.ts
