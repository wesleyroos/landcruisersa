#!/bin/zsh
# Weekly launchd job: refresh operator Google ratings (Places API), then commit +
# push ONLY if a figure changed → auto-deploy bakes the new numbers into the
# static guide HTML. Runs from this Mac because the Places key lives in .env here.
#
# Install:   launchctl load  ~/Library/LaunchAgents/za.co.landcruisersa.ratings.plist
# Uninstall: launchctl unload ~/Library/LaunchAgents/za.co.landcruisersa.ratings.plist
# Logs:      ~/Library/Logs/lcsa-ratings.log
set -uo pipefail

REPO="/Users/wesleyroos/Developer/LandCruiserSA"
NODE="/Users/wesleyroos/.nvm/versions/node/v22.22.0/bin/node"
GIT="/usr/bin/git"
FILE="src/data/operator-ratings.json"

cd "$REPO" || exit 1
set -a; source .env; set +a

echo "── $(date '+%Y-%m-%d %H:%M:%S') refreshing operator ratings ──"
"$NODE" scripts/refresh-operator-ratings.mjs || { echo "refresh script failed"; exit 1; }

if "$GIT" diff --quiet -- "$FILE"; then
  echo "no rating changes — nothing to deploy"
else
  "$GIT" add "$FILE"
  "$GIT" commit -q -m "chore: weekly operator ratings refresh (Google Places)"
  if "$GIT" push -q origin main; then
    echo "pushed updated ratings → auto-deploy"
  else
    echo "git push failed — will retry next run"
  fi
fi
echo "── $(date '+%Y-%m-%d %H:%M:%S') done ──"
