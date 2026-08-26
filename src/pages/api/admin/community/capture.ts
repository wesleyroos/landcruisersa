export const prerender = false;

import type { APIRoute } from 'astro';
import { requireAdmin, unauthorized } from '@/lib/admin-auth';
import { captureBuild } from '@/lib/ig-community';

// Capture a found community build into a draft repost. Accepts the resolved
// image URL + owner handle (+ optional source url/caption) — the capture
// front-end (bookmarklet / proxy grid) does the IG-side resolution; this just
// rehosts the image to R2, drafts the caption, and queues a draft.
// Bearer INGEST_TOKEN accepted so the capture bookmarklet can post headlessly.
function checkToken(request: Request): boolean {
  const auth = request.headers.get('authorization') ?? '';
  const token = import.meta.env.INGEST_TOKEN ?? process.env.INGEST_TOKEN;
  return !!token && auth === `Bearer ${token}`;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!requireAdmin(cookies) && !checkToken(request)) return unauthorized();

  let body: any;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 }); }

  const result = await captureBuild({
    imageUrl: body.imageUrl ?? body.image_url ?? undefined,
    imageUrls: Array.isArray(body.imageUrls) ? body.imageUrls.map(String) : undefined,
    handle: String(body.handle ?? ''),
    sourceUrl: body.sourceUrl ?? body.source_url ?? undefined,
    sourceCaption: body.sourceCaption ?? body.source_caption ?? body.caption ?? undefined,
    location: typeof body.location === 'string' ? body.location : undefined,
    hashtags: Array.isArray(body.hashtags) ? body.hashtags.map(String).slice(0, 40) : undefined,
    likes: Number.isFinite(body.likes) ? Number(body.likes) : undefined,
    width: Number(body.width) || undefined,
    height: Number(body.height) || undefined,
  });

  if (!result.ok) return new Response(JSON.stringify({ error: result.error }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  return new Response(JSON.stringify({ ok: true, id: result.build.id, slug: result.build.slug, image_url: result.build.image_url, caption: result.build.caption }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
};

// CORS preflight so a bookmarklet on instagram.com can POST here.
export const OPTIONS: APIRoute = () => new Response(null, {
  status: 204,
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  },
});
