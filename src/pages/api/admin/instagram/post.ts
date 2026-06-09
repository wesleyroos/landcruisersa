export const prerender = false;

import type { APIRoute } from 'astro';
import { getCredentials, postListingToInstagram, buildCaption } from '@/lib/instagram';
import { db } from '@/db/index';
import { listings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

export const POST: APIRoute = async ({ request }) => {
  const creds = await getCredentials();
  if (!creds) {
    return new Response(JSON.stringify({ error: 'Instagram not connected' }), { status: 401 });
  }

  let body: { listingId?: number; previewOnly?: boolean };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { listingId, previewOnly } = body;

  if (!listingId) {
    return new Response(JSON.stringify({ error: 'listingId required' }), { status: 400 });
  }

  const listing = db.select().from(listings).where(eq(listings.id, listingId)).get();
  if (!listing) {
    return new Response(JSON.stringify({ error: 'Listing not found' }), { status: 404 });
  }

  if (previewOnly) {
    const photos: string[] = JSON.parse(listing.photos);
    return new Response(JSON.stringify({ caption: buildCaption(listing), photoCount: photos.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const igPostId = await postListingToInstagram(listing, creds);
    db.update(listings)
      .set({ ig_posted_at: new Date() })
      .where(eq(listings.id, listingId))
      .run();
    return new Response(JSON.stringify({ ok: true, igPostId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[IG post]', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
};
