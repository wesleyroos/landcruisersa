export const prerender = false;

import type { APIRoute } from 'astro';
import { clearArticlePosted } from '@/lib/article-config';
import { requireAdmin, unauthorized } from '@/lib/admin-auth';

// Undo a mistaken IG article post marker (e.g. deleted it on Instagram) so the
// article reads "not yet posted" again.
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!requireAdmin(cookies)) return unauthorized();

  let body: { slug?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  if (!body.slug) {
    return new Response(JSON.stringify({ error: 'slug required' }), { status: 400 });
  }

  clearArticlePosted(body.slug);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
