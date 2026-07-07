export const prerender = false;

import type { APIRoute } from 'astro';
import sharp from 'sharp';
import { db } from '@/db/index';
import { listings, listingDocs } from '@/db/schema';
import { requireAdmin, unauthorized } from '@/lib/admin-auth';
import { eq } from 'drizzle-orm';

sharp.concurrency(1);

function bad(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

const str = (v: FormDataEntryValue | null) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? null : s;
};

// Compress a phone photo of a licence disc to a small JPEG for private storage.
async function compress(input: Buffer): Promise<Buffer> {
  try {
    return await sharp(input, { limitInputPixels: 40_000_000, failOn: 'none' })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
  } catch {
    return input;
  }
}

// Upsert the vehicle-identity fields (+ optional disc image) for an OWN listing.
// SENSITIVE: admin-only; the disc image is stored as a private DB BLOB, never on
// the public bucket. Accepts multipart/form-data so the disc photo can ride along.
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!requireAdmin(cookies)) return unauthorized();

  let form: FormData;
  try { form = await request.formData(); } catch { return bad('Expected form data'); }

  const listingId = Number(form.get('listing_id'));
  if (!Number.isInteger(listingId)) return bad('Invalid listing_id');

  const [listing] = await db.select().from(listings).where(eq(listings.id, listingId));
  if (!listing) return bad('Listing not found', 404);
  if (listing.source !== 'own') return bad('Docs can only be stored on own/private-seller listings', 403);

  const discExpiry = str(form.get('disc_expiry'));
  if (discExpiry && !/^\d{4}-\d{2}-\d{2}$/.test(discExpiry)) return bad('Disc expiry must be YYYY-MM-DD');

  const now = new Date();
  const values: Record<string, unknown> = {
    slug:        listing.slug,
    vin:         str(form.get('vin')),
    engine_no:   str(form.get('engine_no')),
    licence_no:  str(form.get('licence_no')),
    register_no: str(form.get('register_no')),
    disc_expiry: discExpiry,
    notes:       str(form.get('notes')),
    updated_at:  now,
  };

  // Optional disc image (compressed → BLOB). Absent field = leave existing image.
  const file = form.get('disc_image');
  if (file && typeof file !== 'string' && file.size > 0) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return bad('Invalid image type');
    if (file.size > 15 * 1024 * 1024) return bad('Image too large (max 15MB)');
    values.disc_image = await compress(Buffer.from(await file.arrayBuffer()));
    values.disc_image_type = 'image/jpeg';
  }

  const [existing] = await db.select({ id: listingDocs.id })
    .from(listingDocs).where(eq(listingDocs.listing_id, listingId));

  if (existing) {
    await db.update(listingDocs).set(values).where(eq(listingDocs.listing_id, listingId));
  } else {
    await db.insert(listingDocs).values({
      listing_id: listingId,
      created_at: now,
      ...(values as any),
    });
  }

  return new Response(JSON.stringify({ ok: true, hasImage: 'disc_image' in values || undefined }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};
