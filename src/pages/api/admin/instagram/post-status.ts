export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { listings } from '@/db/schema';
import { requireAdmin, unauthorized } from '@/lib/admin-auth';
import { eq } from 'drizzle-orm';

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

  return new Response(JSON.stringify({
    posted: !!listing.ig_posted_at,
    postedAt: listing.ig_posted_at ? listing.ig_posted_at.toISOString() : null,
  }), { headers: { 'Content-Type': 'application/json' } });
};
