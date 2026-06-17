export const prerender = false;

import type { APIRoute } from 'astro';
import { buildOAuthUrl, saveOAuthState } from '@/lib/instagram';
import { requireAdmin, unauthorized } from '@/lib/admin-auth';
import { randomBytes } from 'crypto';

const APP_ID      = import.meta.env.INSTAGRAM_APP_ID      ?? process.env.INSTAGRAM_APP_ID;
const REDIRECT_URI = import.meta.env.INSTAGRAM_REDIRECT_URI ?? process.env.INSTAGRAM_REDIRECT_URI;

export const GET: APIRoute = async ({ cookies }) => {
  if (!requireAdmin(cookies)) return unauthorized();

  if (!APP_ID || !REDIRECT_URI) {
    return new Response('Instagram app not configured', { status: 503 });
  }

  const state = randomBytes(16).toString('hex');
  await saveOAuthState(state);

  return Response.redirect(buildOAuthUrl(APP_ID, REDIRECT_URI, state), 302);
};
