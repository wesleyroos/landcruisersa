// Instagram rejects any image outside 4:5 (0.8) → 1.91:1 with a flat
// "The aspect ratio is not supported." — the whole post fails, no clue which
// photo. AutoTrader galleries regularly carry a couple of extra-wide shots
// (2.07:1 interior/side shots seen on listing 25622), so this trims those to
// the nearest allowed ratio and rehosts the trimmed copy to R2 for IG to fetch.
// Centre-crop rather than letterbox: the overshoot is usually small (a 2.07:1
// photo loses ~8% of its width) and bars look broken in a carousel.
// Only the Instagram copy is touched — the listing's own photos stay as they are.
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { putToR2 } from './sources/r2';

const MIN_RATIO = 0.8;    // 4:5 portrait
const MAX_RATIO = 1.91;   // 1.91:1 landscape
// Aim a hair inside the boundary so rounding on Instagram's side can't re-trip it.
const TARGET_MAX = 1.90;
const TARGET_MIN = 0.81;

async function fetchBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Returns a URL Instagram will accept:
 *   - the original, if it's already inside the allowed range (or unreadable —
 *     we don't block a post on our own fetch failing)
 *   - a cropped copy on R2, if it was out of range
 *   - null, if it's out of range and the crop couldn't be hosted
 */
export async function fitPhotoForIg(url: string): Promise<string | null> {
  const buf = await fetchBytes(url);
  if (!buf) return url;

  let width: number | undefined, height: number | undefined, orientation: number | undefined;
  try {
    ({ width, height, orientation } = await sharp(buf).metadata());
  } catch {
    return url;
  }
  if (!width || !height) return url;

  // EXIF-rotated photos report their pre-rotation dimensions.
  if (orientation && orientation >= 5) [width, height] = [height, width];

  const ratio = width / height;
  if (ratio >= MIN_RATIO && ratio <= MAX_RATIO) return url;

  let cropW = width, cropH = height;
  if (ratio > MAX_RATIO) cropW = Math.round(height * TARGET_MAX);
  else                   cropH = Math.round(width / TARGET_MIN);

  let out: Buffer;
  try {
    out = await sharp(buf)
      .rotate()                                    // bake in EXIF orientation
      .extract({
        left: Math.max(0, Math.round((width - cropW) / 2)),
        top:  Math.max(0, Math.round((height - cropH) / 2)),
        width: cropW,
        height: cropH,
      })
      .jpeg({ quality: 88 })
      .toBuffer();
  } catch (e) {
    console.error(`[IG fit] crop failed for ${url}:`, e instanceof Error ? e.message : String(e));
    return null;
  }

  const key = `listings/ig-fit/${createHash('sha1').update(url).digest('hex').slice(0, 16)}-${cropW}x${cropH}.jpg`;
  const hosted = await putToR2(key, out, 'image/jpeg');
  if (!hosted) {
    console.error(`[IG fit] R2 upload failed for ${url} — photo dropped from the post`);
    return null;
  }
  console.log(`[IG fit] ${url} ${width}x${height} (${ratio.toFixed(2)}:1) → ${cropW}x${cropH}`);
  return hosted;
}

/** Same, over a list — photos that can't be made publishable are dropped. */
export async function fitPhotosForIg(urls: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const url of urls) {
    const fitted = await fitPhotoForIg(url);
    if (fitted) out.push(fitted);
  }
  return out;
}
