#!/usr/bin/env bash
# Downloads all images from the WordPress media library via the REST API.
# Usage: bash scripts/download-wp-media.sh
# Outputs to: public/images/wp-media/

set -euo pipefail

SITE="https://landcruisersa.co.za"
OUT_DIR="public/images/wp-media"
PER_PAGE=100

mkdir -p "$OUT_DIR"

page=1
total_downloaded=0

while true; do
  echo "→ Fetching media page $page..."

  response=$(curl -s \
    "${SITE}/wp-json/wp/v2/media?per_page=${PER_PAGE}&page=${page}&media_type=image" \
    -D /tmp/wp-headers.txt)

  # Check for empty array or error
  count=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))" 2>/dev/null || echo "0")

  if [ "$count" -eq 0 ]; then
    echo "✓ No more media on page $page. Done."
    break
  fi

  # Extract source URLs and slugs
  urls=$(echo "$response" | python3 -c "
import sys, json
items = json.load(sys.stdin)
for item in items:
    url = item.get('source_url', '')
    slug = item.get('slug', str(item.get('id','')))
    alt  = item.get('alt_text', '').replace('\n', ' ')[:80]
    print(f'{url}\t{slug}\t{alt}')
")

  while IFS=$'\t' read -r url slug alt; do
    [ -z "$url" ] && continue
    ext="${url##*.}"
    ext="${ext%%\?*}"  # strip query strings
    filename="${slug}.${ext}"
    filepath="${OUT_DIR}/${filename}"

    if [ -f "$filepath" ]; then
      echo "  skip  $filename (already exists)"
    else
      echo "  ↓     $filename"
      [ -n "$alt" ] && echo "        alt: $alt"
      curl -sL --retry 3 -o "$filepath" "$url" && total_downloaded=$((total_downloaded + 1))
    fi
  done <<< "$urls"

  # Check if there are more pages
  total=$(grep -i "x-wp-total:" /tmp/wp-headers.txt | tr -d '[:space:]' | cut -d: -f2)
  total_pages=$(grep -i "x-wp-totalpages:" /tmp/wp-headers.txt | tr -d '[:space:]' | cut -d: -f2)

  echo "  (Page $page of ${total_pages:-?}, ${total:-?} total items)"

  if [ -z "$total_pages" ] || [ "$page" -ge "${total_pages}" ]; then
    break
  fi

  page=$((page + 1))
done

echo ""
echo "✓ Downloaded $total_downloaded new image(s) to $OUT_DIR/"
echo ""
echo "Files:"
ls -lh "$OUT_DIR/" | tail -n +2
