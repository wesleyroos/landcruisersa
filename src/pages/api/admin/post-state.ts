export const prerender = false;

import type { APIRoute } from 'astro';
import { requireAdmin, unauthorized } from '@/lib/admin-auth';
import { setState, isPostState } from '@/lib/post-state';

const bad = (msg: string) =>
  new Response(JSON.stringify({ error: msg }), { status: 400, headers: { 'Content-Type': 'application/json' } });

// Set a guide's live publication state (published / unlisted / draft) from the
// admin content table. Takes effect immediately — the guide surfaces are SSR and
// read the state per request.
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!requireAdmin(cookies)) return unauthorized();

  let body: { slug?: string; state?: string };
  try { body = await request.json(); } catch { return bad('Invalid JSON'); }

  const { slug, state } = body;
  if (!slug || typeof slug !== 'string') return bad('slug required');
  if (!isPostState(state)) return bad('state must be published, unlisted or draft');

  setState(slug, state);
  return new Response(JSON.stringify({ ok: true, slug, state }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
