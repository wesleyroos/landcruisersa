export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { listingDocs } from '@/db/schema';
import { requireAdmin, unauthorized } from '@/lib/admin-auth';
import { eq } from 'drizzle-orm';

// Streams the private licence-disc image for a listing. Admin-only, no-cache,
// no public URL exists — the bytes live in the DB, not on the public R2 bucket.
export const GET: APIRoute = async ({ params, cookies }) => {
  if (!requireAdmin(cookies)) return unauthorized();

  const listingId = Number(params.id);
  if (!Number.isInteger(listingId)) return new Response('Bad id', { status: 400 });

  const [doc] = await db.select({ img: listingDocs.disc_image, type: listingDocs.disc_image_type })
    .from(listingDocs).where(eq(listingDocs.listing_id, listingId));

  if (!doc || !doc.img) return new Response('Not found', { status: 404 });

  const buf = Buffer.isBuffer(doc.img) ? doc.img : Buffer.from(doc.img as ArrayBuffer);
  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': doc.type ?? 'image/jpeg',
      'Cache-Control': 'private, no-store',
      'Content-Disposition': 'inline',
    },
  });
};
