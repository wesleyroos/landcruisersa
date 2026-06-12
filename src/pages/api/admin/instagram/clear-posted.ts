export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { listings } from '@/db/schema';
import { eq } from 'drizzle-orm';

// Undo a mistaken IG post marker (e.g. posted the wrong listing, deleted it
// on Instagram) — clears ig_posted_at so the listing reads "not yet posted".
export const POST: APIRoute = async ({ request, cookies }) => {
  const token = cookies.get('lcsa_admin')?.value;
  const secret = import.meta.env.ADMIN_SECRET ?? process.env.ADMIN_SECRET;
  if (!token || !secret || token !== secret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let body: { listingId?: number };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  if (!body.listingId) {
    return new Response(JSON.stringify({ error: 'listingId required' }), { status: 400 });
  }

  const res = db.update(listings)
    .set({ ig_posted_at: null })
    .where(eq(listings.id, Number(body.listingId)))
    .run();

  return new Response(JSON.stringify({ ok: true, cleared: res.changes > 0 }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
