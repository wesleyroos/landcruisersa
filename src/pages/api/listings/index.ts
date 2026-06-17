export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { listings } from '@/db/schema';
import { rateLimited, clientIp } from '@/lib/rate-limit';

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
    province, new_or_used, transmission, fuel_type, colour,
    description, mods, photos,
    seller_name, seller_email, seller_phone,
    dealer_offer_optin = false,
    lcsa_hp,
  } = body;

  // Honeypot — bots fill the hidden lcsa_hp field; humans never see it. Pretend
  // success so the bot can't tell it was rejected, but write nothing.
  if (String(lcsa_hp ?? '').trim() !== '') {
    return new Response(JSON.stringify({ ok: true }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  }

  // Anonymous endpoint — cap submissions per IP so it can't be scripted to
  // flood the pending queue (and the notification inbox). A real seller posts
  // one or two; 5/hr is comfortable headroom.
  if (rateLimited(`listing:${clientIp(request)}`, 5, 60 * 60 * 1000)) {
    return new Response(JSON.stringify({ error: 'Too many submissions — please try again later.' }), { status: 429 });
  }

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
    fuel_type: fuel_type || null,
    colour,
    description,
    mods: mods || null,
    photos: JSON.stringify(photos ?? []),
    seller_name,
    seller_email,
    seller_phone,
    dealer_offer_optin: dealer_offer_optin === true && listing_type === 'for_sale',
    status: 'pending',
    created_at: new Date(),
  });

  // Email notification
  const resendKey = import.meta.env.RESEND_API_KEY ?? process.env.RESEND_API_KEY;
  const notifyEmail = import.meta.env.NOTIFY_EMAIL ?? process.env.NOTIFY_EMAIL;
  if (resendKey && notifyEmail) {
    const typeLabel = listing_type === 'show_off' ? '★ Show Off' : '🔖 For Sale';
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'noreply@landcruisersa.co.za',
        to: [notifyEmail, 'wesley@grodigital.co.za'],
        subject: `[LCSA] New listing pending: ${title}`,
        html: `<p><strong>${typeLabel}</strong></p>
               <p>${title}</p>
               <p>${year} · ${province}</p>
               ${listing_type === 'for_sale' ? `<p>Price: R${Number(price).toLocaleString()}</p>` : ''}
               <p>From: ${seller_name} — ${seller_email} — ${seller_phone}</p>
               ${dealer_offer_optin === true && listing_type === 'for_sale' ? `<p>🏷️ <strong>Wants a dealer offer</strong> — shop to dealer partners.</p>` : ''}
               <p><a href="https://landcruisersa.co.za/admin">Review in Admin →</a></p>`,
      }),
    }).catch(() => {}); // fire-and-forget
  }

  return new Response(JSON.stringify({ ok: true, slug }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
