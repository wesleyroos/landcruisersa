export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { listings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { rateLimited, clientIp } from '@/lib/rate-limit';
import { randomToken } from '@/lib/token';
import { sendManageLinkEmail } from '@/lib/seller-live-email';

// "Is this your listing?" — a seller who lost their emailed manage link can
// request a fresh one from the listing page. We only ever email the listing's
// own seller_email, and always return the same generic response so the endpoint
// can't be used to probe which email a listing belongs to. Also mints a token
// on demand for legacy listings that predate the feature.

// Generic reply — identical whether or not the email matched (no enumeration).
const GENERIC = { ok: true, message: "If that email matches this listing, we've sent your private manage link." };
const generic = () => new Response(JSON.stringify(GENERIC), { status: 200, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  if (rateLimited(`reqmanage:${clientIp(request)}`, 10, 60 * 60 * 1000)) {
    return new Response(JSON.stringify({ error: 'Too many requests — please try again later.' }), { status: 429 });
  }

  let body: { slug?: string; email?: string };
  try { body = await request.json(); } catch { return generic(); }

  const slug = String(body.slug ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!slug || !email.includes('@')) return generic();

  const row = db.select().from(listings).where(eq(listings.slug, slug)).get();
  // Only own/private-seller listings are manageable; scraped rows (source_url)
  // and mismatched emails get the same generic reply.
  if (!row || row.source_url || (row.seller_email ?? '').trim().toLowerCase() !== email) {
    return generic();
  }

  // Mint a token on demand for listings that predate the edit-link feature.
  let token = row.edit_token;
  if (!token) {
    token = randomToken();
    await db.update(listings).set({ edit_token: token }).where(eq(listings.id, row.id));
  }

  await sendManageLinkEmail({ ...row, edit_token: token });
  return generic();
};
