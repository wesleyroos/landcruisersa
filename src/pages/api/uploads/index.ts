export const prerender = false;

import type { APIRoute } from 'astro';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomBytes } from 'crypto';
import sharp from 'sharp';
import { requireAdmin } from '@/lib/admin-auth';
import { rateLimited, clientIp } from '@/lib/rate-limit';

// Keep memory low on the 256MB Fly machine: one image at a time.
sharp.concurrency(1);

// Resize to a sensible max edge and re-encode as quality JPEG. Phone uploads
// arrive as 6–10MB originals; this brings them to ~150–300KB with no visible
// quality loss. Returns the compressed buffer, or the original on failure.
const MAX_EDGE = 1920;
// Returns null when the image can't be decoded — the caller must REJECT then.
// The old fallback (return the original bytes) is how ten iPhone HEIC files
// ended up on R2 named .jpg with ContentType image/jpeg: sharp's prebuilt
// libvips can't decode HEIC (HEVC patents), the catch swallowed it, and every
// Chrome visitor saw broken images while Safari (which decodes HEIC) looked
// fine (listing 31479, found 2026-09-15). Never store what we can't decode.
async function compress(input: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(input, { limitInputPixels: 40_000_000, failOn: 'none' })
      .rotate() // honour EXIF orientation before stripping metadata
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer();
  } catch {
    return null;
  }
}

// HEIF container brands ("ftypheic", "ftypheix", "ftypmif1"…) at offset 4 —
// the browser often mislabels these as image/jpeg, so sniff the bytes.
function looksLikeHeic(b: Buffer): boolean {
  return b.length > 12 && b.subarray(4, 8).toString('ascii') === 'ftyp'
    && /^(hei|hev|mif|msf)/.test(b.subarray(8, 12).toString('ascii'));
}

const R2_ENDPOINT = import.meta.env.R2_ENDPOINT ?? process.env.R2_ENDPOINT;
const R2_ACCESS_KEY_ID = import.meta.env.R2_ACCESS_KEY_ID ?? process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = import.meta.env.R2_SECRET_ACCESS_KEY ?? process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = import.meta.env.R2_BUCKET ?? process.env.R2_BUCKET ?? 'landcruisersa';
const R2_PUBLIC_URL = import.meta.env.R2_PUBLIC_URL ?? process.env.R2_PUBLIC_URL ?? 'https://pub-6c900fb2e73a4b89bc049099101e4591.r2.dev';

export const POST: APIRoute = async ({ request, cookies }) => {
  // Public sellers upload listing photos here, so this can't be admin-only —
  // but throttle anonymous callers to stop bucket/bandwidth flooding. Admins
  // (bulk-editing galleries) bypass the limit. ~40/hr covers a full submission.
  if (!requireAdmin(cookies) && rateLimited(`upload:${clientIp(request)}`, 40, 60 * 60 * 1000)) {
    return new Response(JSON.stringify({ error: 'Too many uploads — please try again shortly.' }), { status: 429 });
  }

  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    return new Response(JSON.stringify({ error: 'Storage not configured' }), { status: 503 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file || file.size === 0) {
    return new Response(JSON.stringify({ error: 'No file' }), { status: 400 });
  }

  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) {
    return new Response(JSON.stringify({ error: 'Invalid file type' }), { status: 400 });
  }

  if (file.size > 10 * 1024 * 1024) {
    return new Response(JSON.stringify({ error: 'File too large (max 10MB)' }), { status: 400 });
  }

  const raw = Buffer.from(await file.arrayBuffer());
  const body = await compress(raw);
  if (!body) {
    const msg = looksLikeHeic(raw)
      ? "That photo is in iPhone's HEIC format, which most browsers can't display. Quick fix: on your iPhone go to Settings → Camera → Formats and pick \"Most Compatible\", then re-take or re-export the photos — or WhatsApp them to yourself and upload the WhatsApp copies (those are JPGs)."
      : "We couldn't read that image file. Please upload photos as JPG or PNG.";
    return new Response(JSON.stringify({ error: msg }), { status: 415 });
  }
  const key = `uploads/listings/${Date.now()}-${randomBytes(4).toString('hex')}.jpg`;

  const s3 = new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });

  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: 'image/jpeg',
    CacheControl: 'public, max-age=31536000, immutable',
  }));

  return new Response(JSON.stringify({ url: `${R2_PUBLIC_URL}/${key}` }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
