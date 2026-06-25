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
SITE_URL="${SITE_URL:-https://landcruisersa.co.za}"

# Per-source schedule toggles, set from /admin/scrapers. Fail-open: if the
# config fetch fails, run everything (AutoTrader can ONLY run from this Mac).
SCHED_JSON="$(curl -fsS -H "Authorization: Bearer ${INGEST_TOKEN:-}" "$SITE_URL/api/scraper-config" 2>/dev/null || echo '')"
is_scheduled() {
  [ -z "$SCHED_JSON" ] && return 0
  echo "$SCHED_JSON" | grep -q "\"$1\"[[:space:]]*:[[:space:]]*false" && return 1 || return 0
}

# AutoTrader runs at most once per ~20h (daily-ish) so we never re-trip its
# per-IP rate limiter; carsza keeps the 6h cadence. The manual "Run" button in
# the admin bypasses both this marker and the schedule toggle.
AT_MARKER="$HOME/.lcsa-at-last-run"
at_due() {
  [ ! -f "$AT_MARKER" ] && return 0
  local last; last=$(cat "$AT_MARKER" 2>/dev/null || echo 0)
  [ $(( $(date +%s) - last )) -ge 72000 ]
}

echo "── $(date '+%Y-%m-%d %H:%M:%S') starting local ingests ──"

# ── AutoTrader now runs in the CLOUD (GitHub Action .github/workflows/
#    autotrader.yml) via the DataImpulse residential proxy — no Mac dependency
#    (2026-06-25). The LC AT ingest + gallery/description backfills + R2 rehost
#    all moved there. Only cars.co.za (Cloudflare → still needs this Mac) and the
#    Jimny passes run locally now.
LC_AT_RAN=0   # LC AT no longer runs here, so the Jimny AT pass always runs below

# ── Jimny SA — separate site, same scrapers, Jimny segment only, routed to
#    jimnysa. cars.co.za + WBC don't hit AutoTrader's rate limiter, so run them
#    every cycle. The Jimny AUTOTRADER pass DOES, so run it ONLY on cycles where
#    the LC AT crawl did NOT run — otherwise it 503s on the per-IP limiter the LC
#    crawl just maxed out (the old back-to-back `sleep 120` was never enough).
#    Gated on JIMNY_INGEST_TOKEN (.env); no-op if unset.
if [ -n "${JIMNY_INGEST_TOKEN:-}" ]; then
  JURL="${JIMNY_SITE_URL:-https://jimnysa.fly.dev}"
  jimny() { SCRAPE_SEGMENT=jimny SITE_URL="$JURL" INGEST_TOKEN="$JIMNY_INGEST_TOKEN" "$NODE" --experimental-strip-types "$@"; }
  echo "[cron] jimny: cars.co.za + WBC → $JURL"
  jimny src/scripts/ingest-carsza.ts || echo "[cron] jimny carsza failed"
  jimny src/scripts/ingest-wbc.ts    || echo "[cron] jimny wbc failed"
  if [ "$LC_AT_RAN" = "0" ]; then
    echo "[cron] jimny: AutoTrader (LC AT idle this cycle — fresh rate-limit budget)"
    jimny src/scripts/ingest-autotrader.ts || echo "[cron] jimny autotrader failed"
    # Fill full galleries for Jimny AT listings (search tiles expose only 1 image).
    BACKFILL_SEGMENTS=jimny BATCH_SIZE=80 DELAY_MS=3500 jimny scripts/backfill-at-images.ts || echo "[cron] jimny at-image-backfill failed"
    # Rehost AT images to jimnysa's R2 (AT CDN 503s hotlinks). Map JIMNY_R2_* → R2_*.
    if [ -n "${JIMNY_R2_ENDPOINT:-}" ]; then
      R2_ENDPOINT="$JIMNY_R2_ENDPOINT" R2_PUBLIC_URL="$JIMNY_R2_PUBLIC_URL" R2_BUCKET="$JIMNY_R2_BUCKET" \
        R2_ACCESS_KEY_ID="$JIMNY_R2_ACCESS_KEY_ID" R2_SECRET_ACCESS_KEY="$JIMNY_R2_SECRET_ACCESS_KEY" \
        SITE_URL="$JURL" INGEST_TOKEN="$JIMNY_INGEST_TOKEN" \
        "$NODE" --experimental-strip-types src/scripts/rehost-at-images.ts || echo "[cron] jimny at-image-rehost failed"
    fi
  else
    echo "[cron] jimny: skipping AutoTrader this cycle (LC AT just ran — avoiding the rate limiter)"
  fi
fi

if is_scheduled carsza; then
  "$NODE" --experimental-strip-types src/scripts/ingest-carsza.ts || echo "[cron] carsza failed"
else
  echo "[cron] carsza paused via admin toggle — skipping"
fi

echo "── $(date '+%Y-%m-%d %H:%M:%S') local ingests done ──"
