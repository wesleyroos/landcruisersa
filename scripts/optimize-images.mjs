// One-off: shrink the heavy static images PageSpeed flagged on the homepage.
// (Hero + model tiles + og/hero-bg were served at full resolution → ~12.8 MB
// homepage, LCP 4.9s.) We resize to display size and re-encode, then re-upload
// to R2 under the SAME keys — so no markup changes — and R2's putObject sets a
// 1-year immutable cache (also fixes the "efficient cache lifetimes" finding).
// The hero is local + uncached, so it moves to R2 as WebP (markup updated once).
//
// Idempotent + safe: each image is only replaced if the optimised version is
// actually smaller. Run from a residential IP (R2 write creds in .env):
//   node scripts/optimize-images.mjs
import fs from 'node:fs';
import sharp from 'sharp';
import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const PUBLIC = env.R2_PUBLIC_URL ?? 'https://pub-6c900fb2e73a4b89bc049099101e4591.r2.dev';
const BUCKET = env.R2_BUCKET ?? 'landcruisersa';
const s3 = new S3Client({
  region: 'auto', endpoint: env.R2_ENDPOINT,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});
const kb = n => Math.round(n / 1024) + 'KB';

async function put(key, body, type) {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: key, Body: body, ContentType: type,
    CacheControl: 'public, max-age=31536000, immutable',
  }));
}
async function fetchBytes(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

// Resize a JPEG in place on R2 (same key), only if it gets smaller.
async function shrinkJpg(key, width) {
  try {
    const src = await fetchBytes(`${PUBLIC}/${key}`);
    const out = await sharp(src).rotate()
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality: 72, progressive: true, mozjpeg: true }).toBuffer();
    if (out.length >= src.length) { console.log(`· ${key}  ${kb(src.length)} (already lean, skipped)`); return; }
    await put(key, out, 'image/jpeg');
    console.log(`✓ ${key}  ${kb(src.length)} → ${kb(out.length)}`);
  } catch (e) { console.log(`✗ ${key}  ${e.message}`); }
}

// 1. Every model tile under images/models/ (homepage + model-guide pages).
const listed = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'images/models/' }));
const modelJpgs = (listed.Contents ?? []).map(o => o.Key).filter(k => /\.jpe?g$/i.test(k));
console.log(`\n— ${modelJpgs.length} model tiles —`);
for (const k of modelJpgs) await shrinkJpg(k, 760);

// 2. Shared heavies.
console.log('\n— shared —');
await shrinkJpg('images/og-default.jpg', 1200); // OG card: 1200×630 is the spec
await shrinkJpg('images/hero-bg.jpg', 1600);

// 3. Hero: local + uncached → WebP on R2 (markup switches to this URL once).
console.log('\n— hero —');
try {
  const src = fs.readFileSync('public/images/hero-lineup.jpg');
  const out = await sharp(src).resize({ width: 1920, withoutEnlargement: true }).webp({ quality: 70 }).toBuffer();
  await put('images/hero-lineup.webp', out, 'image/webp');
  console.log(`✓ images/hero-lineup.webp  ${kb(src.length)} → ${kb(out.length)}`);
} catch (e) { console.log(`✗ hero  ${e.message}`); }

console.log('\nDone.');
