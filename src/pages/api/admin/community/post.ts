export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { communityBuilds } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin, unauthorized } from '@/lib/admin-auth';
import { postCommunityBuild } from '@/lib/ig-community-post';

// Post a community build to IG now (fire-and-forget; browser polls the row's
// status via the admin page reload, same pattern as the listing poster).
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!requireAdmin(cookies)) return unauthorized();
  let body: { id?: number }; try { body = await request.json(); } catch { return new Response('{}', { status: 400 }); }
  const id = Number(body.id);
  const build = db.select().from(communityBuilds).where(eq(communityBuilds.id, id)).get();
  if (!build) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });

  try {
    const mediaId = await postCommunityBuild(build);
    return new Response(JSON.stringify({ ok: true, media_id: mediaId }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'post failed' }), { status: 500 });
  }
};
