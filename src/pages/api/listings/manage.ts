export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { listings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { rateLimited, clientIp } from '@/lib/rate-limit';
import { offMarketPatch } from '@/lib/listing-status';

// Self-service "manage your listing" save endpoint. Auth is the capability
// token emailed to the seller (no account) — whoever holds the link may edit
// that one listing. Editable fields are the ones a seller actually changes
// (price, mileage, description, colour, transmission, province, photos) plus
// the sold / remove actions. Title/model/year/slug stay admin-only: they drive
// classification and the URL. Any edit re-flags the row for an admin spot-check.

const TRANSMISSIONS = new Set(['manual', 'automatic']);
const PROVINCES = new Set([
  'Gauteng', 'Western Cape', 'KwaZulu-Natal', 'Eastern Cape', 'Limpopo',
  'Mpumalanga', 'North West', 'Free State', 'Northern Cape',
]);

export const POST: APIRoute = async ({ request }) => {
  if (rateLimited(`manage:${clientIp(request)}`, 20, 60 * 60 * 1000)) {
    return new Response(JSON.stringify({ error: 'Too many changes — please try again later.' }), { status: 429 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
  }

  const token = String(body.token ?? '').trim();
  if (!token) return new Response(JSON.stringify({ error: 'Missing token' }), { status: 400 });

  const row = db.select().from(listings).where(eq(listings.edit_token, token)).get();
  // Never confirm/deny which tokens exist beyond a generic 404.
  if (!row) return new Response(JSON.stringify({ error: 'This link is not valid.' }), { status: 404 });
  if (row.source_url) {
    // Scraped listings aren't seller-managed; a token should never land on one.
    return new Response(JSON.stringify({ error: 'This listing cannot be edited here.' }), { status: 403 });
  }

  const action = String(body.action ?? 'update');

  if (action === 'sold' || action === 'remove') {
    const status = action === 'sold' ? 'sold' : 'removed';
    await db.update(listings)
      .set({ status, ...offMarketPatch(status) })
      .where(eq(listings.id, row.id));
    return new Response(JSON.stringify({ ok: true, action }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // ── Field update ───────────────────────────────────────────────────────────
  const updates: Record<string, unknown> = { review_flag: true };

  if (body.price !== undefined)       updates.price = Math.max(0, Math.round(Number(body.price) || 0));
  if (body.mileage !== undefined)     updates.mileage = Math.max(0, Math.round(Number(body.mileage) || 0));
  if (typeof body.description === 'string' && body.description.trim()) updates.description = body.description.trim().slice(0, 5000);
  if (typeof body.colour === 'string') updates.colour = body.colour.trim().slice(0, 40);
  if (typeof body.transmission === 'string' && TRANSMISSIONS.has(body.transmission)) updates.transmission = body.transmission;
  if (typeof body.province === 'string' && PROVINCES.has(body.province)) updates.province = body.province;

  if (Array.isArray(body.photos)) {
    // Keep only same-origin upload paths / our R2 host — never let an arbitrary
    // URL be injected as a listing image.
    const clean = (body.photos as unknown[])
      .filter((p): p is string => typeof p === 'string')
      .map(p => p.trim())
      .filter(p => p.startsWith('/uploads/') || p.includes('pub-6c900fb2e73a4b89bc049099101e4591.r2.dev'))
      .slice(0, 10);
    if (clean.length > 0) updates.photos = JSON.stringify(clean);
  }

  await db.update(listings).set(updates).where(eq(listings.id, row.id));
  return new Response(JSON.stringify({ ok: true, action: 'update' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
