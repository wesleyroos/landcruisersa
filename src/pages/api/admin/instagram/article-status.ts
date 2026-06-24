export const prerender = false;

import type { APIRoute } from 'astro';
import { getArticlePosted, getArticlePostError } from '@/lib/article-config';
import { requireAdmin, unauthorized } from '@/lib/admin-auth';

export const GET: APIRoute = ({ url, cookies }) => {
  if (!requireAdmin(cookies)) return unauthorized();

  const slug = url.searchParams.get('slug');
  if (!slug) {
    return new Response(JSON.stringify({ error: 'slug required' }), { status: 400 });
  }

  const rec = getArticlePosted(slug);
  const err = rec ? null : getArticlePostError(slug); // success supersedes a stale error
  return new Response(JSON.stringify({
    posted: !!rec,
    postedAt: rec ? new Date(rec.postedAt * 1000).toISOString() : null,
    failed: !!err,
    error: err?.message ?? null,
  }), { headers: { 'Content-Type': 'application/json' } });
};
