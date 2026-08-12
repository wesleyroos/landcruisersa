export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { listings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { rateLimited, clientIp } from '@/lib/rate-limit';
import { randomBytes } from 'node:crypto';
import {
  boostEnabled, boostPriceCents, boostPriceRand, publicKey, initTransaction,
} from '@/lib/social-boost';

// Opens a Paystack transaction for a listing whose seller asked for the social
// boost. The amount comes from server config — never from the request body.
export const POST: APIRoute = async ({ request }) => {
  const bad = (msg: string, status = 400) =>
    new Response(JSON.stringify({ error: msg }), { status, headers: { 'Content-Type': 'application/json' } });

  if (!boostEnabled()) return bad('Social boost is not available right now.', 503);

  // The reference is a 32-byte random token handed out at submit time, so
  // guessing one isn't realistic. Throttle anyway.
  if (rateLimited(`boost-init:${clientIp(request)}`, 10, 60 * 60 * 1000)) {
    return bad('Too many attempts — please try again later.', 429);
  }

  let ref = '';
  try {
    ref = String(((await request.json()) as { ref?: string }).ref ?? '').trim();
  } catch {
    return bad('Invalid request.');
  }
  if (!ref) return bad('Missing payment reference.');

  const listing = db.select().from(listings).where(eq(listings.social_boost_ref, ref)).get();
  if (!listing) return bad('We could not find that listing.', 404);
  if (listing.social_boost === 'paid') return bad('This boost has already been paid for.', 409);

  const email = (listing.seller_email ?? '').trim();
  if (!email.includes('@')) return bad('That listing has no valid email address.');

  const amountCents = boostPriceCents();
  const meta = { listing_id: listing.id, slug: listing.slug, product: 'social_boost' };

  let init = await initTransaction({ email, amountCents, reference: ref, metadata: meta });

  // Paystack rejects a reference it has already seen. That happens when a seller
  // abandons the popup and re-opens it, so mint a fresh reference, store it on
  // the row, and retry once. The metadata still carries the listing id, so a
  // late completion of the old attempt can still be matched back.
  if (!init) {
    const retryRef = `${ref.slice(0, 24)}${randomBytes(6).toString('hex')}`;
    init = await initTransaction({ email, amountCents, reference: retryRef, metadata: meta });
    if (init) {
      db.update(listings).set({ social_boost_ref: init.reference }).where(eq(listings.id, listing.id)).run();
    }
  }

  if (!init) return bad('We could not start the payment. Please try again shortly.', 502);

  return new Response(JSON.stringify({
    access_code: init.access_code,
    reference: init.reference,
    public_key: publicKey(),
    amount_cents: amountCents,
    price_rand: boostPriceRand(),
  }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
};
