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

export const OG_FALLBACK =
  'https://pub-6c900fb2e73a4b89bc049099101e4591.r2.dev/images/og-default.jpg';

const isUsablePhoto = (u: unknown): u is string =>
  typeof u === 'string' && u.trim() !== '' && !/no-image-car/i.test(u);

/** Parse + clean a listing's photos JSON into a usable URL array (may be empty). */
export function parsePhotos(json: string | null | undefined): string[] {
  try {
    const arr = JSON.parse(json ?? '[]');
    return Array.isArray(arr) ? arr.filter(isUsablePhoto) : [];
  } catch {
    return [];
  }
}

/** First usable photo, or the site OG fallback when a listing has none. */
export function firstPhoto(json: string | null | undefined): string {
  return parsePhotos(json)[0] ?? OG_FALLBACK;
}

/** First usable photo, or null — for surfaces that prefer to omit the image. */
export function firstPhotoOrNull(json: string | null | undefined): string | null {
  return parsePhotos(json)[0] ?? null;
}
