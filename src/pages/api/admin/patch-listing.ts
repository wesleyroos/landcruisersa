export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { listings } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const POST: APIRoute = async ({ request }) => {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  const expected = process.env.INGEST_TOKEN ?? import.meta.env.INGEST_TOKEN;
  if (!token || token !== expected) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let body: { source_id?: string; description?: string; colour?: string; status?: string };
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { source_id, description, colour, status } = body;
  if (!source_id) return new Response(JSON.stringify({ error: 'source_id required' }), { status: 400 });

  const VALID_STATUSES = ['active', 'inactive', 'sold', 'pending'];
  const updates: Record<string, string> = {};
  if (description !== undefined) updates.description = description;
  if (colour !== undefined) updates.colour = colour;
  if (status !== undefined && VALID_STATUSES.includes(status)) updates.status = status;

  if (!Object.keys(updates).length) {
    return new Response(JSON.stringify({ error: 'Nothing to update' }), { status: 400 });
  }

  const result = db.update(listings).set(updates).where(eq(listings.source_id, source_id)).run();
  return new Response(JSON.stringify({ ok: true, changes: result.changes }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
