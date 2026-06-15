export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { listings, clickEvents } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { isAdminSession } from '@/lib/track-guard';

// Click-to-reveal seller contact. The number/email never ships in the page
// HTML — revealing it is itself a tracked funnel event, so "saw the number
// and just dialed" is no longer invisible.
export const GET: APIRoute = async ({ url, cookies }) => {
  const slug = url.searchParams.get('slug') ?? '';
  const kind = url.searchParams.get('kind') ?? '';
  if (!slug || !['phone', 'email'].includes(kind)) {
    return new Response(JSON.stringify({ error: 'slug and kind=phone|email required' }), { status: 400 });
  }

  const listing = db.select({
    title: listings.title,
    phone: listings.seller_phone,
    email: listings.seller_email,
    source_url: listings.source_url,
  }).from(listings)
    .where(and(eq(listings.slug, slug), eq(listings.status, 'active')))
    .get();

  // Only own listings expose contact details (aggregated ones link to the portal)
  if (!listing || listing.source_url) {
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  }

  if (!isAdminSession(cookies)) {
    db.insert(clickEvents).values({
      listing_slug: slug,
      listing_title: listing.title,
      source: kind === 'phone' ? 'reveal_number' : 'reveal_email',
      created_at: new Date(),
    }).run();
  }

  return new Response(JSON.stringify({ value: kind === 'phone' ? listing.phone : listing.email }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
