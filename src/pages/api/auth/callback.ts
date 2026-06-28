export const prerender = false;
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { users, loginTokens } from '@/db/schema';
import { hashToken } from '@/lib/token';
import { setSession } from '@/lib/auth-user';
import { safeNextPath } from '@/lib/http-guards';

function fail(redirect: (path: string) => Response): Response {
  return redirect('/signin/?error=link');
}

export const GET: APIRoute = async ({ request, cookies, redirect }) => {
  const url = new URL(request.url);
  const raw = url.searchParams.get('token') ?? '';
  const next = safeNextPath(url.searchParams.get('next'));
  if (!raw) return fail(redirect);

  const [tok] = db.select().from(loginTokens)
    .where(eq(loginTokens.token_hash, hashToken(raw))).limit(1).all();

  // Reject unknown, already-used, or expired tokens.
  if (!tok || tok.used_at || tok.expires_at.getTime() < Date.now()) return fail(redirect);

  const [user] = db.select().from(users).where(eq(users.id, tok.user_id)).limit(1).all();
  if (!user || user.disabled) return fail(redirect);

  const now = new Date();
  // Burn the token first (single-use), then update the user.
  db.update(loginTokens).set({ used_at: now }).where(eq(loginTokens.id, tok.id)).run();
  db.update(users).set({
    verified_at: user.verified_at ?? now,   // clicking the link proves email ownership
    last_login_at: now,
  }).where(eq(users.id, user.id)).run();

  setSession(cookies, user.id);
  return redirect(next);
};
