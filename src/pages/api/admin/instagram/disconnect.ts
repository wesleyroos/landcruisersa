export const prerender = false;

import type { APIRoute } from 'astro';
import { clearCredentials } from '@/lib/instagram';

export const POST: APIRoute = async () => {
  await clearCredentials();
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
