export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { listings } from '@/db/schema';

function slugify(str: string) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();
  const {
    listing_type = 'for_sale',
    title, model, year, price, mileage,
    province, new_or_used, transmission, colour,
    description, mods, photos,
    seller_name, seller_email, seller_phone,
  } = body;

  if (!title || !model || !year || !seller_email || !seller_name || !seller_phone) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
  }

  if (listing_type === 'for_sale' && (!price || !mileage)) {
    return new Response(JSON.stringify({ error: 'Price and mileage are required for sale listings' }), { status: 400 });
  }

  const base = slugify(`${year}-${title}`);
  const slug = `${base}-${Date.now().toString(36)}`;

  await db.insert(listings).values({
    slug,
    listing_type,
    title,
    model,
    year: Number(year),
    price: listing_type === 'for_sale' ? Number(price) : 0,
    mileage: listing_type === 'for_sale' ? Number(mileage) : 0,
    province,
    new_or_used: new_or_used || 'Used',
    transmission,
    colour,
    description,
    mods: mods || null,
    photos: JSON.stringify(photos ?? []),
    seller_name,
    seller_email,
    seller_phone,
    status: 'pending',
    created_at: new Date(),
  });

  // Email notification (requires RESEND_API_KEY env var)
  const resendKey = import.meta.env.RESEND_API_KEY;
  const notifyEmail = import.meta.env.NOTIFY_EMAIL;
  if (resendKey && notifyEmail) {
    const typeLabel = listing_type === 'show_off' ? '★ Show Off' : '🔖 For Sale';
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'noreply@landcruisersa.co.za',
        to: notifyEmail,
        subject: `[LCSA] New listing pending: ${title}`,
        html: `<p><strong>${typeLabel}</strong></p>
               <p>${title}</p>
               <p>${year} · ${province}</p>
               ${listing_type === 'for_sale' ? `<p>Price: R${Number(price).toLocaleString()}</p>` : ''}
               <p>From: ${seller_name} — ${seller_email} — ${seller_phone}</p>
               <p><a href="https://landcruisersa.co.za/admin">Review in Admin →</a></p>`,
      }),
    }).catch(() => {}); // fire-and-forget
  }

  return new Response(JSON.stringify({ ok: true, slug }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
