export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { listings } from '@/db/schema';
import { eq, and, ne, sql, inArray } from 'drizzle-orm';

function checkToken(request: Request): boolean {
  const auth = request.headers.get('authorization') ?? '';
  const token = import.meta.env.INGEST_TOKEN ?? process.env.INGEST_TOKEN;
  if (!token) return false;
  return auth === `Bearer ${token}`;
}

// Returns active aggregated listings from a given source that have fewer than
// min_photos photos stored. Used by the image backfill script.
// GET /api/aggregated/needs-images?source=autotrader&min_photos=2&limit=50&offset=0
export const GET: APIRoute = async ({ request, url }) => {
  if (!checkToken(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const source = url.searchParams.get('source') ?? 'autotrader';
  const minPhotos = Math.max(1, parseInt(url.searchParams.get('min_photos') ?? '2', 10));
  const limit = Math.min(200, parseInt(url.searchParams.get('limit') ?? '50', 10));
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10));
  // Optional segment scope, e.g. ?segments=land-cruiser — lets the backfill skip
  // galleries for data-only segments (Hilux/Fortuner are aggregate /market data,
  // never shown with a photo gallery, so fetching their images is wasted — and
  // risky — per-listing volume). Widen by passing more segments. Empty = all.
  const segParam = url.searchParams.get('segments');
  const segments = segParam ? segParam.split(',').map(s => s.trim()).filter(Boolean) : [];

  const conds = [
    eq(listings.status, 'active'),
    eq(listings.source, source),
    ne(listings.source, 'own'),
    sql`json_array_length(${listings.photos}) < ${minPhotos}`,
  ];
  if (segments.length) conds.push(inArray(listings.segment, segments));

  const rows = await db
    .select({
      source_id: listings.source_id,
      source_url: listings.source_url,
      photo_count: sql<number>`json_array_length(${listings.photos})`,
    })
    .from(listings)
    .where(and(...conds))
    .limit(limit)
    .offset(offset);

  return new Response(JSON.stringify({ results: rows, limit, offset }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
