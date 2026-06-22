/**
 * Uploads per-model tyre-size article images to R2.
 * Run: node --env-file=.env scripts/upload-tyre-size-images.mjs
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';
import { extname } from 'path';

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
const DL = '/Users/wesleyroos/Downloads';

const IMAGES = [
  // 79 Series — photos by @arwald_extreme
  { localPath: `${DL}/Check out this Toyota Land Cruiser 2.8 79 that has been kitted with awesome accessories by Arwal.jpg`, filename: 'land-cruiser-79-tyre-size.jpg' },
  { localPath: `${DL}/Check out this Toyota Land Cruiser 2.8 79 that has been kitted with awesome accessories by Arwal (1).jpg`, filename: 'land-cruiser-79-tyre-size-2.jpg' },
  // 80 Series
  { localPath: `${DL}/80 series tyre 20-11.webp`, filename: 'land-cruiser-80-series-tyre-size.webp' },
  { localPath: `${DL}/80 series tyres 3-7-2.webp`, filename: 'land-cruiser-80-series-tyre-size-2.webp' },
  // 100 Series
  { localPath: `${DL}/100 series tyres 46481657.jpg`, filename: 'land-cruiser-100-series-tyre-size.jpg' },
  { localPath: `${DL}/100 series tyres 46481672.jpg`, filename: 'land-cruiser-100-series-tyre-size-2.jpg' },
  // 200 Series (inline is the avif converted to jpg)
  { localPath: `${DL}/200 series FE321497514.webp`, filename: 'land-cruiser-200-series-tyre-size.webp' },
  { localPath: '/tmp/200-preview.jpg', filename: 'land-cruiser-200-series-tyre-size-2.jpg' },
  // 300 Series (hero is a GR Sport on all-terrains)
  { localPath: `${DL}/300 series 45254364.jpg`, filename: 'land-cruiser-300-series-tyre-size.jpg' },
  { localPath: `${DL}/300 series 47994410.jpg`, filename: 'land-cruiser-300-series-tyre-size-2.jpg' },
];

const CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

for (const { localPath, filename } of IMAGES) {
  const ext = extname(filename).toLowerCase();
  const key = `images/posts/${filename}`;
  const r2Url = `${PUBLIC_URL}/${key}`;

  process.stdout.write(`Uploading ${filename}... `);
  const buffer = readFileSync(localPath);

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: CONTENT_TYPES[ext] ?? 'image/jpeg',
    CacheControl: 'public, max-age=31536000, immutable',
  }));

  console.log(`✓ → ${r2Url}`);
}
