/**
 * Uploads the Prado 120 (J120) and Prado 90 (J90) model hero images to R2.
 * Images are resized to the 1600×1066 JPEG hero spec before running.
 * Run: node --env-file=.env scripts/upload-prado-heroes.mjs
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

const IMAGES = [
  { localPath: '/tmp/prado-120.jpg', key: 'images/models/prado-120.jpg' },
  { localPath: '/tmp/prado-90.jpg',  key: 'images/models/prado-90.jpg' },
];

for (const { localPath, key } of IMAGES) {
  process.stdout.write(`Uploading ${key}... `);
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: readFileSync(localPath),
    ContentType: 'image/jpeg',
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  console.log(`✓ → ${PUBLIC_URL}/${key}`);
}
