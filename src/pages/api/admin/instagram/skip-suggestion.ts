export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { listings } from '@/db/schema';
import { requireAdmin, unauthorized } from '@/lib/admin-auth';
import { eq } from 'drizzle-orm';

// Skip an IG suggestion: stamps ig_skipped_at so the Hero Engine never
// suggests this listing again ({ undo: true } clears it). Skips are also
// tuning signal — a skipped #1 is a ranking miss worth reading at reviews.
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!requireAdmin(cookies)) return unauthorized();

  let body: { listingId?: number; undo?: boolean };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { listingId, undo } = body;
  if (!listingId) {
    return new Response(JSON.stringify({ error: 'listingId required' }), { status: 400 });
  }

  const listing = db.select({ id: listings.id }).from(listings).where(eq(listings.id, listingId)).get();
  if (!listing) {
    return new Response(JSON.stringify({ error: 'Listing not found' }), { status: 404 });
  }

  db.update(listings)
    .set({ ig_skipped_at: undo ? null : new Date() })
    .where(eq(listings.id, listingId))
    .run();

  return new Response(JSON.stringify({ ok: true, skipped: !undo }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
