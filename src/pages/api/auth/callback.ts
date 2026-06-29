export const prerender = false;
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { users, loginTokens } from '@/db/schema';
import { hashToken } from '@/lib/token';
import { setSession } from '@/lib/auth-user';
import { safeNextPath } from '@/lib/http-guards';

// Consumes a magic-link token and starts a session. This is a POST (submitted by
// the /auth/verify page) on purpose: email security scanners and link-preview
// bots issue GETs and don't run JS, so they can't burn the one-time token before
// the human clicks. The error reason is passed through for diagnosis.
function fail(redirect: (p: string) => Response, reason: string): Response {
  return redirect(`/signin/?error=${reason}`);
}

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData().catch(() => null);
  const raw = String(form?.get('token') ?? '');
  const next = safeNextPath(String(form?.get('next') ?? ''));
  if (!raw) return fail(redirect, 'missing');

  const [tok] = db.select().from(loginTokens)
    .where(eq(loginTokens.token_hash, hashToken(raw))).limit(1).all();
  if (!tok) return fail(redirect, 'notfound');
  if (tok.used_at) return fail(redirect, 'used');
  if (tok.expires_at.getTime() < Date.now()) return fail(redirect, 'expired');

  const [user] = db.select().from(users).where(eq(users.id, tok.user_id)).limit(1).all();
  if (!user || user.disabled) return fail(redirect, 'link');

  const now = new Date();
  db.update(loginTokens).set({ used_at: now }).where(eq(loginTokens.id, tok.id)).run();
  db.update(users).set({
    verified_at: user.verified_at ?? now,   // clicking the link proves email ownership
    last_login_at: now,
  }).where(eq(users.id, user.id)).run();

  setSession(cookies, user.id);
  return redirect(next);
};
