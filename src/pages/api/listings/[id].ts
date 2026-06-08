export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { listings } from '@/db/schema';
import { eq } from 'drizzle-orm';

const UPDATABLE_FIELDS = [
  'status', 'listing_type', 'title', 'model', 'year', 'price', 'mileage',
  'province', 'new_or_used', 'transmission', 'colour', 'description',
  'mods', 'seller_name', 'seller_email', 'seller_phone',
];

export const PATCH: APIRoute = async ({ params, request }) => {
  const id = Number(params.id);
  if (isNaN(id)) {
    return new Response(JSON.stringify({ error: 'Invalid id' }), { status: 400 });
  }

  const body = await request.json();

  const updates: Record<string, unknown> = {};
  for (const key of UPDATABLE_FIELDS) {
    if (key in body) updates[key] = body[key];
  }

  if ('photos' in body && Array.isArray(body.photos)) {
    updates.photos = JSON.stringify(body.photos);
  }

  if (Object.keys(updates).length === 0) {
    return new Response(JSON.stringify({ error: 'No valid fields provided' }), { status: 400 });
  }

  if (updates.status && !['pending', 'active', 'sold'].includes(updates.status as string)) {
    return new Response(JSON.stringify({ error: 'Invalid status' }), { status: 400 });
  }

  await db.update(listings).set(updates).where(eq(listings.id, id));

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: APIRoute = async ({ params }) => {
  const id = Number(params.id);
  if (isNaN(id)) {
    return new Response(JSON.stringify({ error: 'Invalid id' }), { status: 400 });
  }

  await db.delete(listings).where(eq(listings.id, id));

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
