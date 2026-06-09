export const prerender = false;

import type { APIRoute } from 'astro';
import {
  verifyAndClearOAuthState,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getIgUserInfo,
  saveCredentials,
} from '@/lib/instagram';

const APP_ID       = import.meta.env.INSTAGRAM_APP_ID       ?? process.env.INSTAGRAM_APP_ID;
const APP_SECRET   = import.meta.env.INSTAGRAM_APP_SECRET   ?? process.env.INSTAGRAM_APP_SECRET;
const REDIRECT_URI = import.meta.env.INSTAGRAM_REDIRECT_URI ?? process.env.INSTAGRAM_REDIRECT_URI;

export const GET: APIRoute = async ({ url }) => {
  const code  = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return Response.redirect('/admin/instagram?error=denied', 302);
  }

  if (!code || !state) {
    return Response.redirect('/admin/instagram?error=missing_params', 302);
  }

  if (!APP_ID || !APP_SECRET || !REDIRECT_URI) {
    return Response.redirect('/admin/instagram?error=not_configured', 302);
  }

  const valid = await verifyAndClearOAuthState(state);
  if (!valid) {
    return Response.redirect('/admin/instagram?error=invalid_state', 302);
  }

  try {
    const shortToken = await exchangeCodeForToken(code, APP_ID, APP_SECRET, REDIRECT_URI);
    const longToken  = await exchangeForLongLivedToken(shortToken, APP_SECRET);
    const { id, username } = await getIgUserInfo(longToken);

    await saveCredentials({ userId: id, accessToken: longToken, username });

    return Response.redirect('/admin/instagram?connected=1', 302);
  } catch (err) {
    console.error('[IG callback]', err);
    return Response.redirect('/admin/instagram?error=token_exchange', 302);
  }
};
