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
  const origin = url.origin;
  const go = (path: string) => Response.redirect(`${origin}${path}`, 302);

  const code  = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) return go('/admin/instagram?error=denied');
  if (!code || !state) return go('/admin/instagram?error=missing_params');
  if (!APP_ID || !APP_SECRET || !REDIRECT_URI) return go('/admin/instagram?error=not_configured');

  try {
    const valid = await verifyAndClearOAuthState(state);
    if (!valid) return go('/admin/instagram?error=invalid_state');

    const shortToken = await exchangeCodeForToken(code, APP_ID, APP_SECRET, REDIRECT_URI);
    const longToken  = await exchangeForLongLivedToken(shortToken, APP_SECRET);
    const { id, username } = await getIgUserInfo(longToken);

    await saveCredentials({ userId: id, accessToken: longToken, username });

    return go('/admin/instagram?connected=1');
  } catch (err) {
    console.error('[IG callback]', err);
    return go('/admin/instagram?error=token_exchange');
  }
};
