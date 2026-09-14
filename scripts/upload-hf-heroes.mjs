import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';
const s3 = new S3Client({ region: 'auto', endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });
const DIR = '/private/tmp/claude-501/-Users-wesleyroos-Developer-LandCruiserSA/d538cbe2-536a-4e10-bddc-34cbf80d2d2b/scratchpad';
for (const [local, key] of [['hilux-hero.jpg','toyota-hilux-price-south-africa.jpg'],['fortuner-hero.jpg','toyota-fortuner-price-south-africa.jpg']]) {
  await s3.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: `images/posts/${key}`,
    Body: readFileSync(`${DIR}/${local}`), ContentType: 'image/jpeg', CacheControl: 'public, max-age=31536000, immutable' }));
  console.log(`${process.env.R2_PUBLIC_URL}/images/posts/${key}`);
}
