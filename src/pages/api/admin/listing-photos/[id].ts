export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { listings } from '@/db/schema';
import { eq } from 'drizzle-orm';

// Streams a single listing photo with an attachment header so the admin can
// one-click download it for WhatsApp. The image lives on a cross-origin R2
// bucket, so the browser can't force-download it directly (CORS + the
// cross-origin `download` rule) — we proxy the bytes same-origin instead.
//
// Auth: the admin cookie (same secret the /admin pages use). The photo URL is
// only ever read from our own DB by (id, index), never from the request, so
// this can't be turned into an open proxy / SSRF.
export const GET: APIRoute = async ({ params, cookies, url }) => {
  const token = cookies.get('lcsa_admin')?.value;
  const secret = import.meta.env.ADMIN_SECRET ?? process.env.ADMIN_SECRET;
  if (!token || !secret || token !== secret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const id = Number(params.id);
  if (isNaN(id)) return new Response('Bad id', { status: 400 });

  const [listing] = await db.select().from(listings).where(eq(listings.id, id));
  if (!listing) return new Response('Not found', { status: 404 });

  let photos: string[] = [];
  try { photos = JSON.parse(listing.photos); } catch { /* leave empty */ }

  const i = Number(url.searchParams.get('i') ?? '0');
  const src = photos[i];
  if (!src || !/^https?:\/\//.test(src)) {
    return new Response('No such photo', { status: 404 });
  }

  const upstream = await fetch(src);
  if (!upstream.ok) {
    return new Response('Upstream fetch failed', { status: 502 });
  }
  const buf = await upstream.arrayBuffer();

  const ext = ((src.split('?')[0].split('#')[0].split('.').pop()) || 'jpg').toLowerCase();
  const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg';
  const base = `${listing.year}-land-cruiser-${listing.model}`
    .replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').toLowerCase();
  const filename = `${base}-${i + 1}.${safeExt}`;
  const contentType = upstream.headers.get('content-type')
    ?? `image/${safeExt === 'jpg' ? 'jpeg' : safeExt}`;

  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, max-age=0',
    },
  });
};
