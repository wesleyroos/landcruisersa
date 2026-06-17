export const prerender = false;

import type { APIRoute } from 'astro';
import { clearCredentials } from '@/lib/instagram';
import { requireAdmin, unauthorized } from '@/lib/admin-auth';

export const POST: APIRoute = async ({ cookies }) => {
  if (!requireAdmin(cookies)) return unauthorized();

  await clearCredentials();
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
