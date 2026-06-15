export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { listings } from '@/db/schema';
import { and, eq, like } from 'drizzle-orm';

// Lists listings whose photos still point at AutoTrader's CDN (img.autotrader.co.za),
// which rate-limits hotlinks. The local rehost script reads this, copies the images
// to R2, and patches the rows. Once patched the rows no longer match — so the set
// shrinks to only newly-ingested listings each run.
export const GET: APIRoute = async ({ request }) => {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  const expected = process.env.INGEST_TOKEN ?? import.meta.env.INGEST_TOKEN;
  if (!token || token !== expected) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const rows = db.select({ source_id: listings.source_id, photos: listings.photos })
    .from(listings)
    .where(and(eq(listings.status, 'active'), like(listings.photos, '%img.autotrader.co.za%')))
    .all();

  return new Response(JSON.stringify({ count: rows.length, listings: rows }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
