export const prerender = false;

import type { APIRoute } from 'astro';
import { requireAdmin, unauthorized } from '@/lib/admin-auth';
import { setBoostEnabled, setBoostPriceRand, boostEnabled, boostPriceRand } from '@/lib/social-boost';

// Admin control for the paid social boost: whether sellers are offered it, and
// what it costs. Price lives in the database (not an env var) so the willingness
// -to-pay test can be re-priced without a deploy.
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!requireAdmin(cookies)) return unauthorized();

  let body: { enabled?: boolean; price?: number };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
  }

  if (typeof body.enabled === 'boolean') setBoostEnabled(body.enabled);
  if (body.price !== undefined) {
    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 10 || price > 5000) {
      return new Response(JSON.stringify({ error: 'Price must be between R10 and R5000.' }), { status: 400 });
    }
    setBoostPriceRand(price);
  }

  return new Response(JSON.stringify({ ok: true, enabled: boostEnabled(), price: boostPriceRand() }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
