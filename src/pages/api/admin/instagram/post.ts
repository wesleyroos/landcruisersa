export const prerender = false;

import type { APIRoute } from 'astro';
import { getCredentials, postListingToInstagram, buildCaptionWithAIHashtags, buildCaption } from '@/lib/instagram';
import { classifyIgSlot, detectMods } from '@/lib/post-suggestions';
import { db } from '@/db/index';
import { listings, igPosts } from '@/db/schema';
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

  // Which job is this post doing? Hero posts get the hook-opener caption; the
  // slot is also logged so the planner can pace the weekly mix and outcomes
  // roll up per slot.
  const slot = classifyIgSlot(listing);
  const heroMods = slot === 'hero'
    ? detectMods(`${listing.description}\n${listing.mods ?? ''}`)
    : [];

  if (previewOnly) {
    const photos: string[] = JSON.parse(listing.photos);
    const caption = await buildCaptionWithAIHashtags(listing, heroMods);
    return new Response(JSON.stringify({ caption, photoCount: photos.length, slot }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Fire-and-forget — Instagram container processing can take 30-90s,
  // which exceeds Fly's proxy timeout. Return 202 immediately and let
  // the browser poll /api/admin/instagram/post-status for completion.
  const caption = customCaption || buildCaption(listing);
  postListingToInstagram(listing, creds, caption)
    .then(mediaId => {
      db.update(listings).set({ ig_posted_at: new Date(), ig_media_id: mediaId }).where(eq(listings.id, listingId)).run();
      db.insert(igPosts).values({
        listing_id: listingId,
        slug: listing.slug,
        slot,
        media_id: mediaId,
        caption,
        posted_at: new Date(),
      }).run();
      console.log(`[IG post] listing ${listingId} posted successfully (slot: ${slot}, media: ${mediaId})`);
    })
    .catch(err => {
      console.error(`[IG post] listing ${listingId} failed:`, err);
    });

  return new Response(JSON.stringify({ ok: true, pending: true, slot }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' },
  });
};
