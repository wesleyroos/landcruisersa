/**
 * Uploads the Titan Secure theft-guide images to R2.
 * Run: node --env-file=.env scripts/upload-titan-images.mjs
 */
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync, readdirSync } from 'fs';

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});
const BUCKET = process.env.R2_BUCKET;
const PUBLIC_URL = process.env.R2_PUBLIC_URL;
const DIR = '/tmp/titan-img';

for (const file of readdirSync(DIR).filter(f => f.endsWith('.jpg'))) {
  const key = `images/posts/${file}`;
  process.stdout.write(`Uploading ${file}... `);
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: key, Body: readFileSync(`${DIR}/${file}`),
    ContentType: 'image/jpeg', CacheControl: 'public, max-age=31536000, immutable',
  }));
  console.log(`✓ → ${PUBLIC_URL}/${key}`);
}
