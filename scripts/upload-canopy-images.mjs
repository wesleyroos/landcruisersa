import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';
const s3 = new S3Client({ region: 'auto', endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });
const BUCKET = process.env.R2_BUCKET, PUBLIC_URL = process.env.R2_PUBLIC_URL;
const DIR = '/private/tmp/claude-501/-Users-wesleyroos-Developer-LandCruiserSA/d538cbe2-536a-4e10-bddc-34cbf80d2d2b/scratchpad/canopy';
const IMAGES = [
  ['bushtech-1.jpg', 'land-cruiser-canopies-bushtech-tray-canopy-79.jpg', 'image/jpeg'],
  ['bushtech-sheergear.jpg', 'land-cruiser-canopies-bushtech-aluminium-canopy-79.jpg', 'image/jpeg'],
  ['bigcountry-lc79.webp', 'land-cruiser-canopies-big-country-79.webp', 'image/webp'],
  ['rsi-lc.jpg', 'land-cruiser-canopies-rsi-smartcap-79.jpg', 'image/jpeg'],
  ['alublack-duktak.jpg', 'land-cruiser-canopies-alublack-duktak-tray-79.jpg', 'image/jpeg'],
  ['alublack-bin.jpg', 'land-cruiser-canopies-alublack-slide-off-79.jpg', 'image/jpeg'],
  ['alucab-modcap.jpg', 'land-cruiser-canopies-alucab-modcap-79.jpg', 'image/jpeg'],
  ['bushwakka-kamelback.webp', 'land-cruiser-canopies-bushwakka-kamelback-79.webp', 'image/webp'],
];
for (const [local, key, type] of IMAGES) {
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: `images/posts/${key}`,
    Body: readFileSync(`${DIR}/${local}`), ContentType: type, CacheControl: 'public, max-age=31536000, immutable' }));
  console.log(`${PUBLIC_URL}/images/posts/${key}`);
}
