export const prerender = false;

import type { APIRoute } from 'astro';
import { writeFile, mkdir } from 'fs/promises';
import { resolve } from 'path';
import { randomBytes } from 'crypto';

export const POST: APIRoute = async ({ request }) => {
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
  const name = `${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`;
  const dir = resolve(process.cwd(), 'public/uploads/listings');
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, name), Buffer.from(await file.arrayBuffer()));

  return new Response(JSON.stringify({ url: `/uploads/listings/${name}` }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
