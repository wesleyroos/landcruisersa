import { db } from '@/db/index';
import { communityBuilds, igPosts, type CommunityBuild } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getCredentials, publishImagesToInstagram } from './instagram';

// Publish one community build to Instagram (image(s) + our credit caption),
// reusing the same publish pipeline the listing/article engines use. Logs to
// ig_posts with slot 'community' so the follower-insights loop measures which
// reposts actually grew the account. Fire-and-forget friendly: throws on
// failure so the caller can surface it.
export async function postCommunityBuild(build: CommunityBuild): Promise<string> {
  const creds = await getCredentials();
  if (!creds) throw new Error('Instagram not connected');
  if (build.status === 'posted') throw new Error('already posted');

  const caption = build.caption ?? `📷 Photo by @${build.credit_handle}`;
  let images: string[] = [build.image_url];
  if (build.images) { try { const a = JSON.parse(build.images); if (Array.isArray(a) && a.length) images = a; } catch { /* fall back to cover */ } }
  const mediaId = await publishImagesToInstagram(creds, images, caption);

  db.update(communityBuilds)
    .set({ status: 'posted', posted_at: new Date(), media_id: mediaId })
    .where(eq(communityBuilds.id, build.id))
    .run();

  db.insert(igPosts).values({
    listing_id: null,
    slug: `build:${build.slug}`,
    slot: 'community',
    media_id: mediaId,
    caption,
    posted_at: new Date(),
  }).run();

  return mediaId;
}
