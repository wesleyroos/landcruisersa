import type { AstroCookies } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { users, type User } from '@/db/schema';
import { signSession, verifySession } from './token';

// Public (non-admin) user sessions. Distinct from the admin cookie (lcsa_admin)
// in track-guard.ts — a logged-in buyer is NOT an admin. The cookie holds a
// signed { uid, exp }; the user record is the source of truth on every request.

export const USER_COOKIE = 'lcsa_user';
const SESSION_DAYS = 60;

function isProd(): boolean {
  return (import.meta.env.PROD ?? process.env.NODE_ENV === 'production') === true
    || process.env.NODE_ENV === 'production';
}

// Issue a session cookie for a user id. Called after a magic link is verified.
export function setSession(cookies: AstroCookies, uid: number): void {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  const value = signSession({ uid, exp });
  if (!value) return; // no signing secret configured → no session (fail closed)
  cookies.set(USER_COOKIE, value, {
    httpOnly: true,
    secure: isProd(),
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 86400,
  });
}

export function clearSession(cookies: AstroCookies): void {
  cookies.delete(USER_COOKIE, { path: '/' });
}

// Resolve the current logged-in user from the request cookie, or null. Verifies
// the signature + expiry, then confirms the user still exists and isn't disabled.
export function getCurrentUser(cookies: AstroCookies): User | null {
  const payload = verifySession(cookies.get(USER_COOKIE)?.value);
  if (!payload) return null;
  const [u] = db.select().from(users).where(eq(users.id, payload.uid)).limit(1).all();
  if (!u || u.disabled) return null;
  return u;
}

export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'Sign in required' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
