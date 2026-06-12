export const prerender = false;

import type { APIRoute } from 'astro';
import { isAdminSession } from '@/lib/track-guard';
import { db } from '@/db/index';
import { listings, viewEvents } from '@/db/schema';
import { eq } from 'drizzle-orm';

const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|fetch|monitor|headless/i;

export const POST: APIRoute = async ({ request , cookies }) => {
  if (isAdminSession(cookies)) return new Response(null, { status: 204 });
  const ua = request.headers.get('user-agent') ?? '';
  if (BOT_UA.test(ua)) return new Response(null, { status: 204 });

  let body: { listing_slug?: string; utm_source?: string };
  try { body = await request.json(); } catch {
    return new Response('', { status: 400 });
  }

  const { listing_slug, utm_source } = body;
  if (!listing_slug) return new Response('', { status: 400 });

  // Look up the listing server-side — never trust client-sent title/model/price
  const listing = db.select().from(listings).where(eq(listings.slug, listing_slug)).get();
  if (!listing) return new Response(null, { status: 204 });

  try {
    db.insert(viewEvents).values({
      listing_slug,
      listing_title: listing.title,
      model: listing.model,
      price: listing.price,
      utm_source: utm_source ? String(utm_source).toLowerCase().slice(0, 32) : null,
      created_at: new Date(),
    }).run();
  } catch (err) {
    console.error('[track-view] DB insert failed:', err);
  }

  return new Response(null, { status: 204 });
};
