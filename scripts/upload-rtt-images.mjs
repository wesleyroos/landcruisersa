/**
 * Uploads RTT article images to R2.
 * Run: node --env-file=.env scripts/upload-rtt-images.mjs
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

const IMAGES = [
  {
    localPath: '/tmp/rtt-upload-gen3r-sunset.jpg',
    filename: 'best-rooftop-tent-for-a-land-cruiser-gen3r-sunset.jpg',
  },
  {
    localPath: '/tmp/rtt-upload-gen3r-table-mountain.jpg',
    filename: 'best-rooftop-tent-for-a-land-cruiser-gen3r-table-mountain.jpg',
  },
  {
    localPath: '/tmp/rtt-upload-tentco-prado.webp',
    filename: 'best-rooftop-tent-for-a-land-cruiser-tentco-prado.webp',
  },
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
