export const prerender = false;
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { users, loginTokens } from '@/db/schema';
import { randomToken, hashToken, authConfigured } from '@/lib/token';
import { sendMagicLinkEmail } from '@/lib/user-email';
import { rateLimited, clientIp } from '@/lib/rate-limit';
import { safeNextPath } from '@/lib/http-guards';

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Keep an attacker (or a typo loop) from using us as an email cannon: cap links
// per IP and per target address.
const IP_MAX = 6,    IP_WINDOW = 15 * 60 * 1000;
const EMAIL_MAX = 4, EMAIL_WINDOW = 60 * 60 * 1000;

// Always answer the same way so the endpoint never reveals whether an email is
// registered (it's a unified signup+login, but we still don't leak membership).
function ok(extra: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ ok: true, ...extra }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { /* tolerate empty/bad body */ }

  // Honeypot — a filled hidden field means a bot. Ack silently.
  if (String(body.lcsa_hp ?? '').trim() !== '') return ok();

  if (!authConfigured()) {
    return new Response(JSON.stringify({ ok: false, error: 'Sign-in is not configured.' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }

  const email = String(body.email ?? '').trim().toLowerCase();
  const name = body.name != null ? String(body.name).trim().slice(0, 120) : null;
  const consent = body.consent === true || body.consent === 'true' || body.consent === 'on';
  const next = safeNextPath(typeof body.next === 'string' ? body.next : null);

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return new Response(JSON.stringify({ ok: false, error: 'Enter a valid email address.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const ip = clientIp(request);
  if (rateLimited(`reqlink:ip:${ip}`, IP_MAX, IP_WINDOW)
   || rateLimited(`reqlink:email:${email}`, EMAIL_MAX, EMAIL_WINDOW)) {
    // Don't reveal rate-limit state to a prober; act like success.
    return ok();
  }

  const now = new Date();

  // Upsert the user (passwordless: a sign-in request creates the account).
  let [user] = db.select().from(users).where(eq(users.email, email)).limit(1).all();
  if (!user) {
    [user] = db.insert(users).values({
      email,
      name: name || null,
      consent_at: consent ? now : null,
      created_at: now,
    }).returning().all();
  } else {
    if (user.disabled) return ok(); // disabled account: silently no-op, mutate nothing
    const patch: Partial<typeof users.$inferInsert> = {};
    if (name && !user.name) patch.name = name;
    if (consent && !user.consent_at) patch.consent_at = now;
    if (Object.keys(patch).length) {
      db.update(users).set(patch).where(eq(users.id, user.id)).run();
    }
  }

  // Mint a one-time token; store only its hash.
  const raw = randomToken();
  db.insert(loginTokens).values({
    user_id: user.id,
    token_hash: hashToken(raw),
    expires_at: new Date(now.getTime() + TOKEN_TTL_MS),
    created_at: now,
  }).run();

  const origin = new URL(request.url).origin;
  const link = `${origin}/api/auth/callback?token=${raw}&next=${encodeURIComponent(next)}`;
  await sendMagicLinkEmail(email, link, user.name);

  // In dev only (no PROD build), return the link so the flow is testable without
  // a live mailbox. Never exposed in production.
  const devLink = import.meta.env.PROD ? undefined : link;
  return ok(devLink ? { devLink } : {});
};
