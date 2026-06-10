/**
 * Downloads partner images from overlandsupply.co.za and uploads to R2.
 * Run: node --env-file=.env scripts/migrate-partner-images.mjs
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

const PARTNER_IMAGES = [
  // paul-marsh-4x4
  { slug: 'paul-marsh', url: 'https://overlandsupply.co.za/images/paul-marsh-expedition-27.jpg' },
  { slug: 'paul-marsh', url: 'https://overlandsupply.co.za/images/paul-marsh-ruaha-tanzania.jpg' },
  { slug: 'paul-marsh', url: 'https://overlandsupply.co.za/images/paul-marsh-expedition-36.jpg' },
  { slug: 'paul-marsh', url: 'https://overlandsupply.co.za/images/paul-marsh-expedition-46.jpg' },
  { slug: 'paul-marsh', url: 'https://overlandsupply.co.za/images/paul-marsh-interior-29.jpg' },
  { slug: 'paul-marsh', url: 'https://overlandsupply.co.za/images/paul-marsh-interior-01.jpg' },
  // manjaro-industries
  { slug: 'manjaro', url: 'https://overlandsupply.co.za/images/manjaro-hero-camping.jpg' },
  { slug: 'manjaro', url: 'https://overlandsupply.co.za/images/manjaro-storage-system.jpg' },
  { slug: 'manjaro', url: 'https://overlandsupply.co.za/images/manjaro-solar-setup.jpg' },
  { slug: 'manjaro', url: 'https://overlandsupply.co.za/images/manjaro-aluminum-panels.jpg' },
  { slug: 'manjaro', url: 'https://overlandsupply.co.za/images/manjaro-camping-setup.jpg' },
  // routes-rediscovered
  { slug: 'routes-rediscovered', url: 'https://overlandsupply.co.za/images/routes-rediscovered-hero.webp' },
  { slug: 'routes-rediscovered', url: 'https://overlandsupply.co.za/images/routes-rediscovered-sossusvlei.webp' },
  { slug: 'routes-rediscovered', url: 'https://overlandsupply.co.za/images/routes-rediscovered-elephant.webp' },
  { slug: 'routes-rediscovered', url: 'https://overlandsupply.co.za/images/routes-rediscovered-elephants.webp' },
  { slug: 'routes-rediscovered', url: 'https://overlandsupply.co.za/images/routes-rediscovered-landscape.webp' },
  { slug: 'routes-rediscovered', url: 'https://overlandsupply.co.za/images/routes-rediscovered-baobab.webp' },
  { slug: 'routes-rediscovered', url: 'https://overlandsupply.co.za/images/routes-rediscovered-railway.webp' },
  // toyota-gazoo
  { slug: 'toyota-gazoo', url: 'https://overlandsupply.co.za/images/toyota-gazoo-hero.webp' },
  { slug: 'toyota-gazoo', url: 'https://overlandsupply.co.za/images/toyota-gazoo-mud.webp' },
  { slug: 'toyota-gazoo', url: 'https://overlandsupply.co.za/images/toyota-gazoo-hilux.webp' },
  { slug: 'toyota-gazoo', url: 'https://overlandsupply.co.za/images/toyota-gazoo-steep.webp' },
  { slug: 'toyota-gazoo', url: 'https://overlandsupply.co.za/images/toyota-gazoo-rocks.webp' },
  // overland-storage
  { slug: 'overland-storage', url: 'https://overlandsupply.co.za/images/overland-storage-facility.jpg' },
  { slug: 'overland-storage', url: 'https://overlandsupply.co.za/images/overland-storage-vehicle.jpg' },
];

const CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

const mapping = {};

for (const { slug, url } of PARTNER_IMAGES) {
  const filename = url.split('/').pop();
  const ext = extname(filename).toLowerCase();
  const key = `images/partners/${slug}/${filename}`;
  const newUrl = `${PUBLIC_URL}/${key}`;

  process.stdout.write(`Downloading ${filename}... `);
  const res = await fetch(url);
  if (!res.ok) {
    console.log(`FAILED (${res.status})`);
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

  mapping[url] = newUrl;
  console.log(`✓ → ${newUrl}`);
}

console.log('\n--- URL mapping (copy into partners.ts) ---');
for (const [old, updated] of Object.entries(mapping)) {
  console.log(`${old}\n  → ${updated}\n`);
}
