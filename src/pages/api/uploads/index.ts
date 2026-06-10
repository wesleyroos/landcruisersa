export const prerender = false;

import type { APIRoute } from 'astro';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomBytes } from 'crypto';

const R2_ENDPOINT = import.meta.env.R2_ENDPOINT ?? process.env.R2_ENDPOINT;
const R2_ACCESS_KEY_ID = import.meta.env.R2_ACCESS_KEY_ID ?? process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = import.meta.env.R2_SECRET_ACCESS_KEY ?? process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = import.meta.env.R2_BUCKET ?? process.env.R2_BUCKET ?? 'landcruisersa';
const R2_PUBLIC_URL = import.meta.env.R2_PUBLIC_URL ?? process.env.R2_PUBLIC_URL ?? 'https://pub-6c900fb2e73a4b89bc049099101e4591.r2.dev';

export const POST: APIRoute = async ({ request }) => {
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    return new Response(JSON.stringify({ error: 'Storage not configured' }), { status: 503 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file || file.size === 0) {
    return new Response(JSON.stringify({ error: 'No file' }), { status: 400 });
  }

  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) {
    return new Response(JSON.stringify({ error: 'Invalid file type' }), { status: 400 });
  }

  if (file.size > 10 * 1024 * 1024) {
    return new Response(JSON.stringify({ error: 'File too large (max 10MB)' }), { status: 400 });
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const key = `uploads/listings/${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`;

  const s3 = new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });

  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: Buffer.from(await file.arrayBuffer()),
    ContentType: file.type,
    CacheControl: 'public, max-age=31536000, immutable',
  }));

  return new Response(JSON.stringify({ url: `${R2_PUBLIC_URL}/${key}` }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
