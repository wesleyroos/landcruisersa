export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { listings } from '@/db/schema';
import { eq, ne, and } from 'drizzle-orm';

function checkToken(request: Request): boolean {
  const auth = request.headers.get('authorization') ?? '';
  const token = import.meta.env.INGEST_TOKEN ?? process.env.INGEST_TOKEN;
  if (!token) return false;
  return auth === `Bearer ${token}`;
}

// Returns all aggregated listings that are active and need liveness polling
export const GET: APIRoute = async ({ request }) => {
  if (!checkToken(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const active = await db
    .select({
      id: listings.id,
      slug: listings.slug,
      source: listings.source,
      source_id: listings.source_id,
      source_url: listings.source_url,
      last_polled_at: listings.last_polled_at,
    })
    .from(listings)
    .where(
      and(
        eq(listings.status, 'active'),
        ne(listings.source, 'own'),
      )
    );

  return new Response(JSON.stringify(active), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
