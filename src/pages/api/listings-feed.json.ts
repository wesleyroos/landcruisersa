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
      mods: listings.mods,
      photos: listings.photos,
      created_at: listings.created_at,
    })
    .from(listings)
    .where(and(eq(listings.status, 'active'), eq(listings.segment, 'land-cruiser')))
    .orderBy(listings.created_at);

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
    description: r.description,
    ...(r.mods ? { mods: r.mods } : {}),
    photos: (() => { try { return JSON.parse(r.photos); } catch { return []; } })(),
    listed_at: r.created_at,
  }));

  return new Response(JSON.stringify({ count: data.length, listings: data }, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
