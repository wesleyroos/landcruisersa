export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { listings } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

function checkToken(request: Request): boolean {
  const auth = request.headers.get('authorization') ?? '';
  const token = import.meta.env.INGEST_TOKEN ?? process.env.INGEST_TOKEN;
  if (!token) return false;
  return auth === `Bearer ${token}`;
}

// Updates only the photos column for an aggregated listing.
// POST /api/aggregated/photos  { source, source_id, photos: string[] }
export const POST: APIRoute = async ({ request }) => {
  if (!checkToken(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let body: { source?: unknown; source_id?: unknown; photos?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return new Response(JSON.stringify({ error: 'Bad JSON' }), { status: 400 });
  }

  const source = typeof body.source === 'string' ? body.source : null;
  const source_id = typeof body.source_id === 'string' ? body.source_id : null;
  const photos = Array.isArray(body.photos) ? (body.photos as unknown[]).filter(p => typeof p === 'string') : null;

  if (!source || !source_id || !photos || photos.length === 0) {
    return new Response(JSON.stringify({ error: 'source, source_id, and photos[] required' }), { status: 400 });
  }

  const result = await db
    .update(listings)
    .set({ photos: JSON.stringify(photos) })
    .where(and(eq(listings.source, source), eq(listings.source_id, source_id)));

  if (result.rowsAffected === 0) {
    return new Response(JSON.stringify({ ok: false, error: 'not found' }), { status: 404 });
  }

  return new Response(JSON.stringify({ ok: true, count: photos.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
