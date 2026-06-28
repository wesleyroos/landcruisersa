export const prerender = false;
import type { APIRoute } from 'astro';
import { clearSession } from '@/lib/auth-user';

// POST to sign out (a GET could be triggered cross-site via an <img>, so we keep
// it to POST). The /account page posts a tiny form here.
export const POST: APIRoute = async ({ cookies, redirect }) => {
  clearSession(cookies);
  return redirect('/');
};
