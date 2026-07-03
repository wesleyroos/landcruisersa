export const prerender = false;

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getCredentials, publishImageToInstagram, buildArticleCaptionWithAIHashtags } from '@/lib/instagram';
import { setArticlePosted, setArticlePostError, clearArticlePostError } from '@/lib/article-config';
import { db } from '@/db/index';
import { igPosts } from '@/db/schema';
import { requireAdmin, unauthorized } from '@/lib/admin-auth';
import { SITE } from '@/data/site';

// featuredImage is usually a full R2 URL already. A relative value is a local
// public/ asset served from the SITE ORIGIN (not R2) — resolve it there so
// Instagram can fetch it. (Sending it to R2 would 404; IG would fail silently.)
function toAbsolute(img: string): string {
  if (/^https?:\/\//.test(img)) return img;
  return `${SITE.url.replace(/\/$/, '')}/${img.replace(/^\//, '')}`;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!requireAdmin(cookies)) return unauthorized();

  const creds = await getCredentials();
  if (!creds) {
    return new Response(JSON.stringify({ error: 'Instagram not connected' }), { status: 401 });
  }

  let body: { slug?: string; previewOnly?: boolean; caption?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { slug, previewOnly, caption: customCaption } = body;
  if (!slug) {
    return new Response(JSON.stringify({ error: 'slug required' }), { status: 400 });
  }

  const posts = await getCollection('posts', p => !p.data.draft && !p.data.unlisted);
  const post = posts.find(p => p.slug === slug);
  if (!post) {
    return new Response(JSON.stringify({ error: 'Article not found (or still a draft)' }), { status: 404 });
  }

  const imageUrl = toAbsolute(post.data.featuredImage);
  const article = { title: post.data.title, excerpt: post.data.excerpt, tags: post.data.tags };

  // Instagram's publishing API only accepts JPEG via image_url — reject anything
  // else up front (in BOTH preview and post) so the admin gets a clear reason
  // instead of a silent 2-minute timeout. (A couple of guides use .webp today.)
  if (!/\.jpe?g(\?|#|$)/i.test(imageUrl)) {
    const name = post.data.featuredImage.split('/').pop();
    return new Response(JSON.stringify({
      error: `Instagram needs a JPEG. This guide's featured image (${name}) isn't a .jpg — swap it for a JPEG to post.`,
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  if (previewOnly) {
    const caption = await buildArticleCaptionWithAIHashtags(article);
    return new Response(JSON.stringify({ caption, imageUrl }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const caption = customCaption || (await buildArticleCaptionWithAIHashtags(article));

  // Fire-and-forget — Instagram container processing can take 30-90s, which
  // exceeds Fly's proxy timeout. Return 202 immediately; the browser polls
  // /api/admin/instagram/article-status until the post is marked done (or failed).
  clearArticlePostError(slug);
  publishImageToInstagram(creds, imageUrl, caption)
    .then((mediaId) => {
      setArticlePosted(slug, { postedAt: Math.floor(Date.now() / 1000), mediaId, caption, imageUrl });
      db.insert(igPosts).values({ slug, slot: 'article', media_id: mediaId, caption, posted_at: new Date() }).run();
      console.log(`[IG article] ${slug} posted successfully (media ${mediaId})`);
    })
    .catch(err => {
      const message = err instanceof Error ? err.message : String(err);
      setArticlePostError(slug, message);
      console.error(`[IG article] ${slug} failed:`, message);
    });

  return new Response(JSON.stringify({ ok: true, pending: true }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' },
  });
};
