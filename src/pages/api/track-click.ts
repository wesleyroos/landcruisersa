export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { clickEvents } from '@/db/schema';

const VALID_SOURCES = ['autotrader', 'wbc', 'adios', 'wbb'];

export const POST: APIRoute = async ({ request }) => {
  let body: { listing_slug?: string; listing_title?: string; source?: string };
  try { body = await request.json(); } catch {
    return new Response('', { status: 400 });
  }

  const { listing_slug, listing_title, source } = body;
  if (!listing_slug || !source || !VALID_SOURCES.includes(source)) {
    return new Response('', { status: 400 });
  }

  try {
    db.insert(clickEvents).values({
      listing_slug,
      listing_title: listing_title || null,
      source,
      created_at: new Date(),
    }).run();
  } catch (err) {
    console.error('[track-click] DB insert failed:', err);
  }

  return new Response('', { status: 204 });
};
