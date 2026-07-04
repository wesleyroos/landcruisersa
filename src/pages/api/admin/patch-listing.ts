export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { listings } from '@/db/schema';
import { offMarketPatch } from '@/lib/listing-status';
import { detectBodyType } from '@/lib/sources/normalize';
import { eq } from 'drizzle-orm';

export const POST: APIRoute = async ({ request }) => {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  const expected = process.env.INGEST_TOKEN ?? import.meta.env.INGEST_TOKEN;
  if (!token || token !== expected) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let body: { source_id?: string; description?: string; colour?: string; status?: string; photos?: string[] };
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { source_id, description, colour, status, photos } = body;
  if (!source_id) return new Response(JSON.stringify({ error: 'source_id required' }), { status: 400 });

  const VALID_STATUSES = ['active', 'inactive', 'sold', 'pending'];
  const updates: Record<string, unknown> = {};
  if (description !== undefined) updates.description = description;
  if (colour !== undefined) updates.colour = colour;
  if (Array.isArray(photos)) updates.photos = JSON.stringify(photos);
  if (status !== undefined && VALID_STATUSES.includes(status)) {
    updates.status = status;
    Object.assign(updates, offMarketPatch(status)); // stamp/clear off_market_at alongside the status
  }

  if (!Object.keys(updates).length) {
    return new Response(JSON.stringify({ error: 'Nothing to update' }), { status: 400 });
  }

  // The AT description backfill lands here — the game-viewer signal usually
  // lives in that description, so re-classify unclassified rows when it arrives.
  if (typeof description === 'string' && description.trim()) {
    const row = db.select({ title: listings.title, body_type: listings.body_type })
      .from(listings).where(eq(listings.source_id, source_id)).get();
    if (row && row.body_type === null) {
      const bt = detectBodyType(row.title, description);
      if (bt) updates.body_type = bt;
    }
  }

  const result = db.update(listings).set(updates).where(eq(listings.source_id, source_id)).run();
  return new Response(JSON.stringify({ ok: true, changes: result.changes }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
