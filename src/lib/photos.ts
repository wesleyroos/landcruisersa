// Centralised photo parsing for listings.
//
// A listing's `photos` column is a JSON-array string. Two cleanups happen here
// so every render surface (detail page, cards, emails, IG picks) behaves the
// same:
//   1. Drop AutoTrader's "no image" placeholder (no-image-car.svg). ~168 active
//      listings carry it; rendering it shows a broken/placeholder graphic to
//      users and trips Ahrefs' image audit. Better to fall back to our OG image.
//   2. Drop empty / non-string entries defensively.
//
// NB: raw `img.autotrader.co.za` hotlinks are NOT dropped here — they're real
// images (just not yet rehosted to R2). Removing them would blank ~543 cards.
// Rehosting is handled separately by scripts/rehost-at-images.

// Social-share / OG fallback only — the branded marketplace card. NEVER use this
// as a visible listing image; use LISTING_PLACEHOLDER for missing listing photos.
export const OG_FALLBACK =
  'https://pub-6c900fb2e73a4b89bc049099101e4591.r2.dev/images/og-marketplace.jpg';

// Neutral branded "No photos available" card — shown wherever a listing has no
// usable photo, so we never pass off a stock render as the actual vehicle.
export const LISTING_PLACEHOLDER =
  'https://pub-6c900fb2e73a4b89bc049099101e4591.r2.dev/images/listing-placeholder.webp';

const isUsablePhoto = (u: unknown): u is string =>
  typeof u === 'string' && u.trim() !== '' && !/no-image-car/i.test(u);

/**
 * Card-thumbnail URL via the wsrv.nl image proxy (resize + WebP + global CDN
 * cache). Listing photos are stored full-res (300-800KB); serving those into a
 * ~400px card slot is why browsing felt broken on slow connections — a 640px
 * WebP is ~25-50KB. Works for every origin we render (R2, WBC, cars.co.za, and
 * not-yet-rehosted img.autotrader.co.za hotlinks, which it also shields behind
 * its cache). wsrv never upscales, so small images pass through unchanged.
 * BaseLayout has a global onerror fallback that recovers the original from the
 * ?url= param if wsrv is ever down — so this must stay the ONLY thumb format.
 */
export function thumb(url: string, width = 640): string {
  if (!/^https?:\/\//i.test(url)) return url;
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=${width}&q=75&output=webp`;
}

/** First usable photo as a card thumbnail (see thumb()). */
export function firstThumb(json: string | null | undefined, width = 640): string {
  return thumb(firstPhoto(json), width);
}

/** Parse + clean a listing's photos JSON into a usable URL array (may be empty). */
export function parsePhotos(json: string | null | undefined): string[] {
  try {
    const arr = JSON.parse(json ?? '[]');
    return Array.isArray(arr) ? arr.filter(isUsablePhoto) : [];
  } catch {
    return [];
  }
}

/** First usable photo, or the branded "no photos" placeholder when none. */
export function firstPhoto(json: string | null | undefined): string {
  return parsePhotos(json)[0] ?? LISTING_PLACEHOLDER;
}

/** First usable photo, or null — for surfaces that prefer to omit the image. */
export function firstPhotoOrNull(json: string | null | undefined): string | null {
  return parsePhotos(json)[0] ?? null;
}

/** True if a listing has at least one genuine photo (placeholder doesn't count).
 *  Listings without one are hidden from all browse surfaces — we don't show
 *  vehicles we can't picture. */
export function hasUsablePhoto(json: string | null | undefined): boolean {
  return parsePhotos(json).length > 0;
}
