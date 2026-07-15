export const prerender = false;

import type { APIRoute } from 'astro';
import { isAdminSession } from '@/lib/track-guard';
import { db } from '@/db/index';
import { clickEvents } from '@/db/schema';

const VALID_SOURCES = ['autotrader', 'wbc', 'adios', 'wbb', 'carsza', 'vcsa', 'whatsapp', 'call', 'email', 'reveal_number', 'reveal_email', 'finance_calc'];

export const POST: APIRoute = async ({ request , cookies }) => {
  if (isAdminSession(cookies)) return new Response(null, { status: 204 });
  let body: { listing_slug?: string; listing_title?: string; source?: string; client_id?: string };
  try { body = await request.json(); } catch {
    return new Response('', { status: 400 });
  }

  const { listing_slug, listing_title, source, client_id } = body;
  if (!listing_slug || !source || !VALID_SOURCES.includes(source)) {
    return new Response('', { status: 400 });
  }

  try {
    db.insert(clickEvents).values({
      listing_slug,
      listing_title: listing_title || null,
      source,
      client_id: client_id ? String(client_id).slice(0, 64) : null,
      created_at: new Date(),
    }).run();
  } catch (err) {
    console.error('[track-click] DB insert failed:', err);
  }

  return new Response(null, { status: 204 });
};
