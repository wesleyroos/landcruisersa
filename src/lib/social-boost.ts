// Paid social boost — a private seller pays a once-off fee and we post their
// vehicle to the LCSA Instagram + Facebook pages.
//
// Money rules that must not be broken:
//   • The amount is decided SERVER-SIDE (site_config) and the transaction is
//     initialised server-side, so the browser can never choose what it pays.
//   • A listing is only marked 'paid' after Paystack itself confirms it — via
//     the verify call on return, or the signed webhook. Never on the client's
//     say-so.
//   • The listing is created FIRST and payment happens after. A failed or
//     abandoned payment must never cost the seller their listing.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { db } from '@/db/index';
import { listings, siteConfig } from '@/db/schema';
import { eq } from 'drizzle-orm';

const PAYSTACK_API = 'https://api.paystack.co';

const ENABLED_KEY = 'social_boost_enabled';
const PRICE_KEY = 'social_boost_price'; // whole rand, stored as a string

export const DEFAULT_PRICE_RAND = 99;

function env(name: string): string {
  return String((import.meta.env as Record<string, unknown>)[name] ?? process.env[name] ?? '');
}

export function secretKey(): string {
  return env('PAYSTACK_SECRET_KEY');
}
export function publicKey(): string {
  return env('PAYSTACK_PUBLIC_KEY');
}

// Hard gate: with no Paystack keys there is no way to take money, so the offer
// must not appear at all. Soft gate: the admin toggle in Settings.
export function boostConfigured(): boolean {
  return !!secretKey() && !!publicKey();
}

function configValue(key: string): string | null {
  return db.select().from(siteConfig).where(eq(siteConfig.key, key)).get()?.value ?? null;
}

function setConfigValue(key: string, value: string): void {
  db.insert(siteConfig)
    .values({ key, value, updated_at: new Date() })
    .onConflictDoUpdate({ target: siteConfig.key, set: { value, updated_at: new Date() } })
    .run();
}

export function boostEnabled(): boolean {
  return boostConfigured() && configValue(ENABLED_KEY) === '1';
}

export function setBoostEnabled(on: boolean): void {
  setConfigValue(ENABLED_KEY, on ? '1' : '0');
}

// Price in whole rand. Clamped to a sane range so a typo in the admin field
// can't create a R1 or R100,000 boost.
export function boostPriceRand(): number {
  const raw = Number(configValue(PRICE_KEY));
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_PRICE_RAND;
  return Math.min(5000, Math.max(10, Math.round(raw)));
}

export function setBoostPriceRand(rand: number): void {
  const clean = Math.min(5000, Math.max(10, Math.round(Number(rand) || DEFAULT_PRICE_RAND)));
  setConfigValue(PRICE_KEY, String(clean));
}

export function boostPriceCents(): number {
  return boostPriceRand() * 100;
}

// ── Paystack API ─────────────────────────────────────────────────────────────

interface InitResult {
  access_code: string;
  reference: string;
}

// Creates the transaction on Paystack and returns the access code the inline
// popup resumes. `reference` is our own token, so verify/webhook can find the
// listing again without trusting anything the browser sends back.
export async function initTransaction(opts: {
  email: string;
  amountCents: number;
  reference: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
}): Promise<InitResult | null> {
  const key = secretKey();
  if (!key) return null;
  try {
    const res = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: opts.email,
        amount: opts.amountCents,
        currency: 'ZAR',
        reference: opts.reference,
        callback_url: opts.callbackUrl,
        metadata: opts.metadata ?? {},
      }),
    });
    const json = await res.json() as { status?: boolean; data?: InitResult };
    if (!res.ok || !json.status || !json.data?.access_code) return null;
    return { access_code: json.data.access_code, reference: json.data.reference };
  } catch {
    return null;
  }
}

export interface VerifyResult {
  success: boolean;
  amountCents: number;
  reference: string;
}

export async function verifyTransaction(reference: string): Promise<VerifyResult | null> {
  const key = secretKey();
  if (!key) return null;
  try {
    const res = await fetch(`${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const json = await res.json() as { status?: boolean; data?: { status?: string; amount?: number; reference?: string } };
    if (!res.ok || !json.status || !json.data) return null;
    return {
      success: json.data.status === 'success',
      amountCents: Number(json.data.amount ?? 0),
      reference: String(json.data.reference ?? reference),
    };
  } catch {
    return null;
  }
}

// Paystack signs every webhook with HMAC-SHA512 of the raw body, keyed on the
// secret key. An unsigned or mis-signed body is a forgery — drop it.
export function validWebhookSignature(rawBody: string, signature: string | null): boolean {
  const key = secretKey();
  if (!key || !signature) return false;
  const expected = createHmac('sha512', key).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ── Marking a listing paid ───────────────────────────────────────────────────

// Idempotent: the verify-on-return call and the webhook both land here and the
// second one is a no-op, so the seller is never double-counted or double-emailed.
// Returns the listing only on the transition into 'paid'.
//
// `fallbackListingId` comes from the Paystack metadata we set at init time. It
// covers the rare case where a seller abandons a payment, re-opens the popup
// (which mints a fresh reference), and then completes the FIRST one — whose
// reference is no longer the one stored on the row.
export function markBoostPaid(reference: string, amountCents: number, fallbackListingId?: number) {
  let listing = db.select().from(listings).where(eq(listings.social_boost_ref, reference)).get();
  if (!listing && fallbackListingId) {
    listing = db.select().from(listings).where(eq(listings.id, fallbackListingId)).get();
  }
  if (!listing) return null;
  if (listing.social_boost === 'paid') return null; // already recorded

  db.update(listings)
    .set({
      social_boost: 'paid',
      social_boost_amount: amountCents,
      social_boost_paid_at: new Date(),
    })
    .where(eq(listings.id, listing.id))
    .run();

  return { ...listing, social_boost: 'paid', social_boost_amount: amountCents };
}

// ── Resuming an unpaid boost ─────────────────────────────────────────────────
// Payment used to be reachable only from the submit page, in the seconds after
// a listing was created: close that tab and the seller had no way back, and we
// had no way to ask for the money again. Both of the first two real requests
// were lost that way. The pay link below is keyed on edit_token — the stable
// per-listing capability token we already email — rather than social_boost_ref,
// which init() re-mints whenever Paystack rejects a re-used reference.

const SITE = 'https://landcruisersa.co.za';

export function boostPayUrl(listing: { edit_token?: string | null }): string | null {
  return listing.edit_token ? `${SITE}/listings/boost/${listing.edit_token}` : null;
}

// A listing the seller may still pay a boost on: one of our own submissions
// (never a scraped row) that isn't already paid for.
export function listingByEditToken(token: string) {
  const listing = db.select().from(listings).where(eq(listings.edit_token, token)).get();
  if (!listing || listing.source_url) return null;
  return listing;
}

// Puts a listing into 'requested' and hands back a payment reference. Called
// when someone clicks Pay on the boost page for a listing that never asked for
// a boost (or whose reference predates this flow) — never on a page view, so a
// row only says 'requested' once a seller has actually reached for their card.
export function ensureBoostRef(listingId: number, existingRef: string | null): string {
  const ref = existingRef ?? randomBytes(32).toString('hex');
  db.update(listings)
    .set({ social_boost: 'requested', social_boost_ref: ref, social_boost_asked_at: new Date() })
    .where(eq(listings.id, listingId))
    .run();
  return ref;
}
