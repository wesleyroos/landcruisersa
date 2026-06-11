/**
 * Uploads WP media RTT images to R2 for the RTT article.
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
    localPath: 'public/images/wp-media/25009820_546431939028373_8890019670594158592_n.jpg',
    filename: 'best-rooftop-tent-for-a-land-cruiser-alucab-lc79.jpg',
  },
  {
    localPath: 'public/images/wp-media/gen-3-tent-cut-out-1.jpg',
    filename: 'best-rooftop-tent-for-a-land-cruiser-gen3r.jpg',
  },
  {
    localPath: 'public/images/wp-media/rooftop-tents-getaway-magazine-10.jpg',
    filename: 'best-rooftop-tent-for-a-land-cruiser-tentco-softshell.jpg',
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
