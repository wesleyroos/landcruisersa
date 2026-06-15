export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { listings } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

export const GET: APIRoute = async () => {
  const rows = await db
    .select({
      slug: listings.slug,
      listing_type: listings.listing_type,
      title: listings.title,
      model: listings.model,
      year: listings.year,
      price: listings.price,
      mileage: listings.mileage,
      province: listings.province,
      new_or_used: listings.new_or_used,
      transmission: listings.transmission,
      colour: listings.colour,
      description: listings.description,
      photos: listings.photos,
      created_at: listings.created_at,
    })
    .from(listings)
    .where(and(eq(listings.status, 'active'), eq(listings.segment, 'land-cruiser')))
    .orderBy(listings.created_at);

  // Public Land Cruiser index only (Hilux/Fortuner stay out of the feed). Heavy
  // fields are trimmed and the
  // output is not pretty-printed so the whole feed fits comfortably in memory on
  // the small instance — full text & galleries live on each listing page.
  function firstPhoto(photos: string): string | null {
    try { return JSON.parse(photos)?.[0] ?? null; } catch { return null; }
  }
  const data = rows.map(r => ({
    url: `https://landcruisersa.co.za/listings/${r.slug}/`,
    listing_type: r.listing_type,
    title: r.title,
    model: r.model,
    year: r.year,
    ...(r.listing_type === 'for_sale' ? {
      price_zar: r.price,
      mileage_km: r.mileage,
    } : {}),
    province: r.province,
    new_or_used: r.new_or_used,
    transmission: r.transmission,
    colour: r.colour,
    description: r.description ? r.description.slice(0, 300) : '',
    image: firstPhoto(r.photos),
    listed_at: r.created_at,
  }));

  return new Response(JSON.stringify({ count: data.length, listings: data }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
