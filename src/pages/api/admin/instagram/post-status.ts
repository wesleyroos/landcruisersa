export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { listings } from '@/db/schema';
import { requireAdmin, unauthorized } from '@/lib/admin-auth';
import { eq, sql } from 'drizzle-orm';

export const GET: APIRoute = ({ url, cookies }) => {
  if (!requireAdmin(cookies)) return unauthorized();

  const id = Number(url.searchParams.get('id'));
  if (!id) {
    return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });
  }

  const listing = db.select({ ig_posted_at: listings.ig_posted_at })
    .from(listings).where(eq(listings.id, id)).get();

  if (!listing) {
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
  }

  // A background-publish failure is stored per listing (the publish is
  // fire-and-forget) — surface it so the admin sees the reason, not a timeout.
  const error = db.get<{ value: string }>(sql`
    SELECT value FROM site_config WHERE key = ${'ig_post_error_' + id}
  `)?.value ?? null;

  return new Response(JSON.stringify({
    posted: !!listing.ig_posted_at,
    postedAt: listing.ig_posted_at ? listing.ig_posted_at.toISOString() : null,
    error,
  }), { headers: { 'Content-Type': 'application/json' } });
};
