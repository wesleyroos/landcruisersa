export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { listings } from '@/db/schema';
import { offMarketPatch } from '@/lib/listing-status';
import { and, eq } from 'drizzle-orm';

function checkToken(request: Request): boolean {
  const auth = request.headers.get('authorization') ?? '';
  const token = import.meta.env.INGEST_TOKEN ?? process.env.INGEST_TOKEN;
  if (!token) return false;
  return auth === `Bearer ${token}`;
}

// Apply liveness results from the poller
// Body: { updates: Array<{ source: string, source_id: string, status: 'live' | 'removed' | 'unknown' }> }
export const POST: APIRoute = async ({ request }) => {
  if (!checkToken(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let body: { updates?: { source: string; source_id: string; status: string }[] };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  if (!Array.isArray(body.updates) || body.updates.length === 0) {
    return new Response(JSON.stringify({ error: 'updates array required' }), { status: 400 });
  }

  const now = new Date();
  let updated = 0;

  for (const item of body.updates) {
    if (!item.source || !item.source_id) continue;

    const dbStatus =
      item.status === 'live' ? 'active' :
      item.status === 'removed' ? 'removed' :
      null; // 'unknown' — only update last_polled_at

    const patch: Record<string, unknown> = { last_polled_at: now };
    if (dbStatus) {
      patch.status = dbStatus;
      Object.assign(patch, offMarketPatch(dbStatus, now)); // stamp/clear off_market_at on the transition
    }

    await db.update(listings)
      .set(patch)
      .where(and(
        eq(listings.source, item.source),
        eq(listings.source_id, item.source_id),
      ));

    updated++;
  }

  return new Response(JSON.stringify({ ok: true, updated }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
