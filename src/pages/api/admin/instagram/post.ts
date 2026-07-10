export const prerender = false;

import type { APIRoute } from 'astro';
import { getCredentials, postListingToInstagram, buildCaptionWithAIHashtags, buildCaption, igSafePhotos } from '@/lib/instagram';
import { classifyIgSlot, detectMods } from '@/lib/post-suggestions';
import { rehostAutotraderImages } from '@/lib/sources/r2';
import { db } from '@/db/index';
import { listings, igPosts } from '@/db/schema';
import { requireAdmin, unauthorized } from '@/lib/admin-auth';
import { eq, sql } from 'drizzle-orm';

const AT_HOTLINK = /img\.autotrader\.co\.za/i;

// On-demand image prep: convert any AutoTrader hotlinks on this listing to R2
// JPEGs so Instagram can ingest them. The daily cloud rehost can't keep up with
// fresh AT scrapes (throughput < inflow — ~160/day arrive, ~40/day cleared), so
// the listing being posted is prepared here rather than waiting in the backlog.
// Fly can fetch img.autotrader.co.za directly (datacenter-OK, unlike AT's HTML).
// Idempotent — images already on R2 are skipped — and it persists the rewritten
// photos so the public site and future posts get the fixed URLs too. Mutates
// listing.photos in place so downstream postListingToInstagram uses the new set.
async function ensurePublishablePhotos(listing: { id: number; photos: string }): Promise<string[]> {
  let photos: string[];
  try { photos = JSON.parse(listing.photos); } catch { return []; }
  if (!photos.some(u => AT_HOTLINK.test(u))) return photos;

  const rehosted = await rehostAutotraderImages(photos);
  if (rehosted.some((u, i) => u !== photos[i])) {
    const json = JSON.stringify(rehosted);
    db.update(listings).set({ photos: json }).where(eq(listings.id, listing.id)).run();
    listing.photos = json;
  }
  return rehosted;
}

// Background-publish errors keyed per listing so post-status can surface the
// real reason (the publish is fire-and-forget; without this a failure just
// looks like a poll timeout in the admin).
export function setIgPostError(listingId: number, message: string): void {
  db.run(sql`
    INSERT INTO site_config (key, value, updated_at)
    VALUES (${'ig_post_error_' + listingId}, ${message.slice(0, 300)}, ${Math.floor(Date.now() / 1000)})
    ON CONFLICT(key) DO UPDATE SET value = ${message.slice(0, 300)}, updated_at = ${Math.floor(Date.now() / 1000)}
  `);
}
export function clearIgPostError(listingId: number): void {
  db.run(sql`DELETE FROM site_config WHERE key = ${'ig_post_error_' + listingId}`);
}

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

  const allPhotos: string[] = JSON.parse(listing.photos);
  const safeNow = igSafePhotos(allPhotos);
  const hasHotlinks = allPhotos.some(u => AT_HOTLINK.test(u));

  // Genuinely unpostable only if nothing is IG-safe AND nothing can be rehosted
  // (e.g. all SVG / non-JPEG, no AutoTrader hotlinks to convert). Hotlinked
  // listings are NOT rejected here — they get prepared on demand below.
  if (safeNow.length === 0 && !hasHotlinks) {
    return new Response(JSON.stringify({
      error: `None of this listing's ${allPhotos.length} photos are IG-publishable (non-JPEG / SVG). Swap in usable photos, then retry.`,
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  if (previewOnly) {
    // Post-rehost, hotlinks become usable JPEGs — so project the full count.
    const projected = hasHotlinks ? allPhotos.filter(u => !/\.svg(\?|#|$)/i.test(u)).length : safeNow.length;
    const caption = await buildCaptionWithAIHashtags(listing, heroMods);
    return new Response(JSON.stringify({
      caption,
      photoCount: Math.min(projected, 10),
      skippedPhotos: allPhotos.length - projected,
      preparingImages: hasHotlinks,   // modal note: images fetched at post time
      slot,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Fire-and-forget — image prep (rehost) + Instagram container processing can
  // take 60-120s, well past Fly's proxy timeout. Return 202 immediately and let
  // the browser poll /api/admin/instagram/post-status for completion.
  const caption = customCaption || buildCaption(listing);
  clearIgPostError(listingId);
  (async () => {
    try {
      // Prepare images first (rehost AT hotlinks → R2), then post. Mutates
      // listing.photos so postListingToInstagram publishes the rehosted set.
      const photos = await ensurePublishablePhotos(listing);
      if (igSafePhotos(photos).length === 0) {
        throw new Error(`Couldn't prepare any of this listing's ${photos.length} photos — AutoTrader's image server kept refusing them. Try again in a minute.`);
      }
      const mediaId = await postListingToInstagram(listing, creds, caption);
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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setIgPostError(listingId, message);
      console.error(`[IG post] listing ${listingId} failed:`, message);
    }
  })();

  return new Response(JSON.stringify({ ok: true, pending: true, slot }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' },
  });
};
