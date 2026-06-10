export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { listings } from '@/db/schema';
import { eq, and, or, isNull, sql } from 'drizzle-orm';

export const GET: APIRoute = async ({ request }) => {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  const expected = process.env.INGEST_TOKEN ?? import.meta.env.INGEST_TOKEN;
  if (!token || token !== expected) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const pending = db.select({
    id:         listings.id,
    source_id:  listings.source_id,
    source_url: listings.source_url,
    colour:     listings.colour,
  }).from(listings).where(
    and(
      eq(listings.source, 'autotrader'),
      eq(listings.status, 'active'),
      or(isNull(listings.description), sql`trim(${listings.description}) = ''`),
    )
  ).all();

  return new Response(JSON.stringify({ listings: pending }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
