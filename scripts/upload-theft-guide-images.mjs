/**
 * Uploads the theft/hijacking-protection guide images to R2.
 * Images courtesy of Ghost South Africa (ghostsouthafrica.co.za).
 * Run: node --env-file=.env scripts/upload-theft-guide-images.mjs
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
const ROOT = '/Users/wesleyroos/Developer/LandCruiserSA/public/images/posts';

const IMAGES = [
  { localPath: `${ROOT}/land-cruiser-theft-hijacking-protection.jpg`, filename: 'land-cruiser-theft-hijacking-protection.jpg' },
  { localPath: `${ROOT}/land-cruiser-ghost-immobiliser-install.jpg`, filename: 'land-cruiser-ghost-immobiliser-install.jpg' },
  { localPath: `${ROOT}/land-cruiser-immobiliser-vs-tracker.jpg`, filename: 'land-cruiser-immobiliser-vs-tracker.jpg' },
];

const CONTENT_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

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
