/**
 * Uploads the Land Cruiser 300 Hybrid article images to R2.
 * Source: Toyota press images (via cars.co.za), rehosted for editorial use.
 * Run: node --env-file=.env scripts/upload-lc300-hybrid-images.mjs
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET;
const PUBLIC_URL = process.env.R2_PUBLIC_URL;
const SRC = '/private/tmp/claude-501/-Users-wesleyroos-Developer-LandCruiserSA/198e049a-2fb6-4c9b-adb3-98d11cdab1e7/scratchpad/lc300hev';

const IMAGES = [
  { localPath: `${SRC}/aus-1.jpg`,    filename: 'land-cruiser-300-hybrid.jpg' },           // hero — GR-Sport, gravel
  { localPath: `${SRC}/aus-3.jpg`,    filename: 'land-cruiser-300-hybrid-rear.jpg' },      // rear 3/4, tow bar
  { localPath: `${SRC}/interior.jpg`, filename: 'land-cruiser-300-hybrid-interior.jpg' },  // ZX cabin
];

for (const { localPath, filename } of IMAGES) {
  const key = `images/posts/${filename}`;
  const r2Url = `${PUBLIC_URL}/${key}`;
  process.stdout.write(`Uploading ${filename}... `);
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: readFileSync(localPath),
    ContentType: 'image/jpeg',
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  console.log(`✓ → ${r2Url}`);
}
