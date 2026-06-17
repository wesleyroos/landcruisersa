export const prerender = false;

import type { APIRoute } from 'astro';
import { getCredentials, refreshLongLivedToken, saveCredentials } from '@/lib/instagram';
import { requireAdmin, unauthorized } from '@/lib/admin-auth';

export const POST: APIRoute = async ({ cookies }) => {
  if (!requireAdmin(cookies)) return unauthorized();

  const creds = await getCredentials();
  if (!creds) {
    return new Response(JSON.stringify({ error: 'Instagram not connected' }), { status: 401 });
  }

  try {
    const newToken = await refreshLongLivedToken(creds.accessToken);
    await saveCredentials({ ...creds, accessToken: newToken });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[IG refresh]', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
};
