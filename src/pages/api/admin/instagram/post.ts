export const prerender = false;

import type { APIRoute } from 'astro';
import { getCredentials, postListingToInstagram, buildCaptionWithAIHashtags } from '@/lib/instagram';
import { db } from '@/db/index';
import { listings } from '@/db/schema';
import { requireAdmin, unauthorized } from '@/lib/admin-auth';
import { eq } from 'drizzle-orm';

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!requireAdmin(cookies)) return unauthorized();

  const creds = await getCredentials();
  if (!creds) {
    return new Response(JSON.stringify({ error: 'Instagram not connected' }), { status: 401 });
  }

  let body: { listingId?: number; previewOnly?: boolean; caption?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { listingId, previewOnly, caption: customCaption } = body;

  if (!listingId) {
    return new Response(JSON.stringify({ error: 'listingId required' }), { status: 400 });
  }

  const listing = db.select().from(listings).where(eq(listings.id, listingId)).get();
  if (!listing) {
    return new Response(JSON.stringify({ error: 'Listing not found' }), { status: 404 });
  }

  if (previewOnly) {
    const photos: string[] = JSON.parse(listing.photos);
    const caption = await buildCaptionWithAIHashtags(listing);
    return new Response(JSON.stringify({ caption, photoCount: photos.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Fire-and-forget — Instagram container processing can take 30-90s,
  // which exceeds Fly's proxy timeout. Return 202 immediately and let
  // the browser poll /api/admin/instagram/post-status for completion.
  postListingToInstagram(listing, creds, customCaption || undefined)
    .then(() => {
      db.update(listings).set({ ig_posted_at: new Date() }).where(eq(listings.id, listingId)).run();
      console.log(`[IG post] listing ${listingId} posted successfully`);
    })
    .catch(err => {
      console.error(`[IG post] listing ${listingId} failed:`, err);
    });

  return new Response(JSON.stringify({ ok: true, pending: true }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' },
  });
};
