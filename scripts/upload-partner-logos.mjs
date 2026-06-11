/**
 * Downloads partner logos and uploads to R2.
 * Run: node --env-file=.env scripts/upload-partner-logos.mjs
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
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

const LOGOS = [
  {
    slug: '4x4-megaworld',
    url: 'https://www.4x4megaworldonline.com/wp-content/uploads/2024/11/4x4-Mega-World-Vector-Logo-November-25-2024.png',
    filename: '4x4-megaworld-logo.png',
  },
  {
    slug: 'paul-marsh',
    url: 'https://paulmarsh4x4.com/wp-content/uploads/2020/01/Paulmarsh-LOGO-1_edited-2.jpg',
    filename: 'paul-marsh-logo.jpg',
  },
  {
    slug: 'manjaro',
    url: 'https://routesrediscovered.co.za/wp-content/uploads/2022/06/MANJARO-LOGO.jpg',
    filename: 'manjaro-logo.jpg',
  },
  {
    slug: 'routes-rediscovered',
    url: 'https://routesrediscovered.co.za/wp-content/uploads/2022/06/FINAL-ROOTS-LOGO-04-web-160p.png',
    filename: 'routes-rediscovered-logo.png',
  },
  {
    slug: 'igl',
    url: 'https://iglcoatings.africa/assets/IGL-Logo-2025_1771256218859-n10Cbpj7.png',
    filename: 'igl-logo.png',
  },
];

const CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

const results = [];

for (const { slug, url, filename } of LOGOS) {
  const ext = extname(filename).toLowerCase();
  const key = `images/partners/${slug}/${filename}`;
  const r2Url = `${PUBLIC_URL}/${key}`;

  process.stdout.write(`Downloading ${filename}... `);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LandCruiserSA/1.0)' },
  });

  if (!res.ok) {
    console.log(`FAILED (${res.status} ${res.statusText})`);
    results.push({ slug, filename, success: false });
    continue;
  }

  const buffer = Buffer.from(await res.arrayBuffer());

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: CONTENT_TYPES[ext] ?? 'application/octet-stream',
    CacheControl: 'public, max-age=31536000, immutable',
  }));

  console.log(`✓ → ${r2Url}`);
  results.push({ slug, filename, success: true, r2Url });
}

console.log('\n--- R2 logo URLs (update partners.ts) ---');
for (const r of results.filter(r => r.success)) {
  console.log(`${r.slug}: '${r.r2Url}',`);
}
