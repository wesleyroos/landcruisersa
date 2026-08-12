export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { listings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { rateLimited, clientIp } from '@/lib/rate-limit';

// Cheap DB-only read of "has this boost been paid?". The submit page polls it
// while the Paystack popup is open, so a payment confirmed by the webhook still
// flips the screen even if the popup's own callback never fires. Deliberately
// does NOT call Paystack — the "check again" button does that.
export const GET: APIRoute = async ({ request, url }) => {
  if (rateLimited(`boost-status:${clientIp(request)}`, 120, 60 * 60 * 1000)) {
    return new Response(JSON.stringify({ error: 'Too many requests.' }), { status: 429 });
  }

  const ref = (url.searchParams.get('ref') ?? '').trim();
  if (!ref) return new Response(JSON.stringify({ error: 'Missing reference.' }), { status: 400 });

  const listing = db.select({ boost: listings.social_boost })
    .from(listings).where(eq(listings.social_boost_ref, ref)).get();

  return new Response(JSON.stringify({ paid: listing?.boost === 'paid' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};
