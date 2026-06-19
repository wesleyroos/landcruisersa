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

if is_scheduled autotrader; then
  if at_due; then
    "$NODE" --experimental-strip-types src/scripts/ingest-autotrader.ts && date +%s > "$AT_MARKER" || echo "[cron] autotrader failed"
    # AT post-processing from this residential IP (AT blocks Fly):
    # 1) Fill full galleries for listings the search tile capped at 1 image (the
    #    SSR tile only exposes all photos for premium listings). Fetched DIRECTLY
    #    from this residential IP — the in-scraper /api/proxy/images path runs on
    #    Fly, which AT blocks. Bounded batch + polite delay, ONCE per daily AT run
    #    (NOT a separate hourly agent — that hammered AT 24×/day and re-blocked the
    #    IP). Runs before rehost so the new images get copied to R2 the same pass.
    BATCH_SIZE=80 DELAY_MS=3500 "$NODE" --experimental-strip-types scripts/backfill-at-images.ts || echo "[cron] at-image-gallery-backfill failed"
    # 2) Fill missing descriptions, then 3) copy AT-hosted images to R2.
    "$NODE" --experimental-strip-types src/scripts/backfill-at-descriptions.ts || echo "[cron] at-desc-backfill failed"
    "$NODE" --experimental-strip-types src/scripts/rehost-at-images.ts || echo "[cron] at-image-rehost failed"

    # ── Jimny SA — same AutoTrader scraper, Jimny segment only, routed to the
    #    separate Jimny site. Gated on JIMNY_INGEST_TOKEN (.env); no-op if unset.
    #    Brief breather so we don't burst AutoTrader straight after the LC crawl.
    if [ -n "${JIMNY_INGEST_TOKEN:-}" ]; then
      echo "[cron] jimny: crawling Suzuki Jimny → ${JIMNY_SITE_URL:-https://jimnysa.fly.dev}"
      sleep 120
      SCRAPE_SEGMENT=jimny SITE_URL="${JIMNY_SITE_URL:-https://jimnysa.fly.dev}" INGEST_TOKEN="$JIMNY_INGEST_TOKEN" \
        "$NODE" --experimental-strip-types src/scripts/ingest-autotrader.ts || echo "[cron] jimny autotrader failed"
      # Fill full galleries for Jimny listings (AT search tiles expose only 1 image).
      SITE_URL="${JIMNY_SITE_URL:-https://jimnysa.fly.dev}" INGEST_TOKEN="$JIMNY_INGEST_TOKEN" BACKFILL_SEGMENTS=jimny BATCH_SIZE=80 DELAY_MS=3500 \
        "$NODE" --experimental-strip-types scripts/backfill-at-images.ts || echo "[cron] jimny at-image-backfill failed"
    fi
  else
    echo "[cron] autotrader ran <20h ago — skipping (daily cadence)"
  fi
else
  echo "[cron] autotrader paused via admin toggle — skipping AT ingest + backfills"
fi

if is_scheduled carsza; then
  "$NODE" --experimental-strip-types src/scripts/ingest-carsza.ts || echo "[cron] carsza failed"
else
  echo "[cron] carsza paused via admin toggle — skipping"
fi

echo "── $(date '+%Y-%m-%d %H:%M:%S') local ingests done ──"
