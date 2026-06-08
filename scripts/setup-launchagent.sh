#!/usr/bin/env bash
# Installs a macOS LaunchAgent that runs the AT image backfill hourly.
# Run once: bash scripts/setup-launchagent.sh
set -euo pipefail

LABEL="co.za.landcruisersa.backfill-at-images"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_FILE="$PLIST_DIR/$LABEL.plist"

# Find node binary
NODE_BIN="$(command -v node)"
if [ -z "$NODE_BIN" ]; then
  echo "Error: node not found in PATH" >&2
  exit 1
fi

# Read required env vars from .env
ENV_FILE="$PROJECT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found — needs INGEST_TOKEN and optionally SITE_URL" >&2
  exit 1
fi

get_env() {
  grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'"
}

INGEST_TOKEN="$(get_env INGEST_TOKEN)"
SITE_URL="$(get_env SITE_URL)"
SITE_URL="${SITE_URL:-https://landcruisersa.fly.dev}"

if [ -z "$INGEST_TOKEN" ]; then
  echo "Error: INGEST_TOKEN not found in $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$PLIST_DIR"

cat > "$PLIST_FILE" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>--experimental-strip-types</string>
    <string>${PROJECT_DIR}/scripts/backfill-at-images.ts</string>
  </array>

  <key>EnvironmentVariables</key>
  <dict>
    <key>INGEST_TOKEN</key>
    <string>${INGEST_TOKEN}</string>
    <key>SITE_URL</key>
    <string>${SITE_URL}</string>
  </dict>

  <!-- Run every hour -->
  <key>StartInterval</key>
  <integer>3600</integer>

  <!-- Also run immediately when loaded -->
  <key>RunAtLoad</key>
  <true/>

  <key>StandardOutPath</key>
  <string>/tmp/lcsa-backfill-at-images.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/lcsa-backfill-at-images.log</string>

  <!-- Only run when on AC power (skip when on battery) -->
  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
PLIST

# Unload existing if any
launchctl unload "$PLIST_FILE" 2>/dev/null || true

# Load
launchctl load "$PLIST_FILE"

echo "✓ LaunchAgent installed: $LABEL"
echo "  Runs hourly while logged in. First run starting now."
echo ""
echo "  Logs:    tail -f /tmp/lcsa-backfill-at-images.log"
echo "  Unload:  launchctl unload '$PLIST_FILE'"
echo "  Remove:  rm '$PLIST_FILE' && launchctl unload '$PLIST_FILE'"
