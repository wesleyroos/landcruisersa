export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { listings, dealerOffers } from '@/db/schema';
import { requireAdmin, unauthorized } from '@/lib/admin-auth';
import { eq } from 'drizzle-orm';

const VERIFICATIONS = ['sight_unseen', 'vin_verified', 'inspected'];

function bad(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

// Add an offer. Scoped to OWN/private-seller listings only — offers are only
// logged on cars we actually broker. Denormalises the vehicle snapshot so the
// datapoint survives if the listing is later deleted.
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!requireAdmin(cookies)) return unauthorized();

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return bad('Invalid JSON'); }

  const listingId = Number(body.listing_id);
  if (!Number.isInteger(listingId)) return bad('Invalid listing_id');

  const dealerName = String(body.dealer_name ?? '').trim();
  if (!dealerName) return bad('Dealer name required');

  const amount = Number(body.offer_amount);
  if (!Number.isFinite(amount) || amount <= 0) return bad('Offer amount must be a positive number');

  const verification = String(body.verification ?? 'sight_unseen');
  if (!VERIFICATIONS.includes(verification)) return bad('Invalid verification');

  const [listing] = await db.select().from(listings).where(eq(listings.id, listingId));
  if (!listing) return bad('Listing not found', 404);
  if (listing.source !== 'own') return bad('Offers can only be logged on own/private-seller listings', 403);

  // offer_date: optional YYYY-MM-DD from the form, else now.
  let offerDate = new Date();
  if (typeof body.offer_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.offer_date)) {
    const parsed = new Date(body.offer_date + 'T12:00:00Z');
    if (!isNaN(parsed.getTime())) offerDate = parsed;
  }

  const now = new Date();
  const [row] = await db.insert(dealerOffers).values({
    listing_id:   listingId,
    slug:         listing.slug,
    dealer_name:  dealerName,
    offer_amount: Math.round(amount),
    verification,
    conditional:  body.conditional === undefined ? true : Boolean(body.conditional),
    notes:        typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null,
    offer_date:   offerDate,
    year:         listing.year,
    model:        listing.model,
    mileage:      listing.mileage,
    asking_price: listing.price,
    created_at:   now,
  }).returning();

  return new Response(JSON.stringify({ ok: true, offer: row }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
  if (!requireAdmin(cookies)) return unauthorized();

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return bad('Invalid JSON'); }

  const id = Number(body.id);
  if (!Number.isInteger(id)) return bad('Invalid id');

  await db.delete(dealerOffers).where(eq(dealerOffers.id, id));
  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};
