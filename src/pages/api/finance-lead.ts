export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { financeLeads } from '@/db/schema';

// Where new finance leads are emailed. Add the finance partner's address here
// once a referral agreement is signed so they receive leads directly.
const FINANCE_RECIPIENTS = [
  'wesley@landcruisersa.co.za',
  'wesley@grodigital.co.za',
];

const esc = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
const toInt = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
};
const toNum = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const rand = (n: number | null) => (n == null ? '—' : 'R ' + n.toLocaleString('en-ZA'));

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request.' }), { status: 400 });
  }

  const name = String(body.name ?? '').trim();
  const phone = String(body.phone ?? '').trim();
  const email = String(body.email ?? '').trim();
  const listing_slug = String(body.listing_slug ?? '').trim();
  const listing_title = String(body.listing_title ?? '').trim() || null;
  const model = String(body.model ?? '').trim() || null;
  const consent = body.consent === true;

  if (!name || !phone || !email) {
    return new Response(JSON.stringify({ error: 'Name, email and phone are required.' }), { status: 400 });
  }
  if (!listing_slug) {
    return new Response(JSON.stringify({ error: 'Missing listing reference.' }), { status: 400 });
  }
  // POPIA: never forward a lead to a finance partner without explicit consent.
  if (!consent) {
    return new Response(JSON.stringify({ error: 'Consent is required to be contacted.' }), { status: 400 });
  }

  const price = toInt(body.price);
  const deposit = toInt(body.deposit);
  const term_months = toInt(body.term_months);
  const interest_rate = toNum(body.interest_rate);
  const balloon_pct = toInt(body.balloon_pct);
  const est_monthly = toInt(body.est_monthly);

  // DB first — the lead is the asset; never lose it to an email hiccup.
  try {
    db.insert(financeLeads).values({
      name, phone, email, listing_slug, listing_title, model,
      price, deposit, term_months, interest_rate, balloon_pct, est_monthly,
      consent, created_at: new Date(),
    }).run();
  } catch (err) {
    console.error('[finance-lead] DB insert failed:', err);
    return new Response(JSON.stringify({ error: 'Could not save your request. Please try again.' }), { status: 500 });
  }

  // Best-effort notification — a failure here must not lose the saved lead.
  const resendKey = import.meta.env.RESEND_API_KEY ?? process.env.RESEND_API_KEY ?? '';
  if (resendKey) {
    const listingUrl = `https://landcruisersa.co.za/listings/${listing_slug}/`;
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'noreply@landcruisersa.co.za',
          to: FINANCE_RECIPIENTS,
          reply_to: email,
          subject: `[LCSA] Finance lead — ${name} · ${listing_title ?? listing_slug}`,
          html: `
            <h2 style="margin:0 0 16px">New finance pre-approval lead</h2>
            <table style="border-collapse:collapse;width:100%;max-width:600px">
              <tr><td style="padding:8px 0;color:#666;width:160px"><strong>Name</strong></td><td style="padding:8px 0">${esc(name)}</td></tr>
              <tr><td style="padding:8px 0;color:#666"><strong>Phone</strong></td><td style="padding:8px 0">${esc(phone)}</td></tr>
              <tr><td style="padding:8px 0;color:#666"><strong>Email</strong></td><td style="padding:8px 0"><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>
              <tr><td colspan="2" style="padding:14px 0 4px"><strong>The deal they're financing</strong></td></tr>
              <tr><td style="padding:8px 0;color:#666"><strong>Vehicle</strong></td><td style="padding:8px 0"><a href="${listingUrl}">${esc(listing_title ?? listing_slug)}</a></td></tr>
              <tr><td style="padding:8px 0;color:#666"><strong>Asking price</strong></td><td style="padding:8px 0">${rand(price)}</td></tr>
              <tr><td style="padding:8px 0;color:#666"><strong>Deposit</strong></td><td style="padding:8px 0">${rand(deposit)}</td></tr>
              <tr><td style="padding:8px 0;color:#666"><strong>Term</strong></td><td style="padding:8px 0">${term_months ?? '—'} months</td></tr>
              <tr><td style="padding:8px 0;color:#666"><strong>Rate (assumed)</strong></td><td style="padding:8px 0">${interest_rate ?? '—'}% p.a.</td></tr>
              <tr><td style="padding:8px 0;color:#666"><strong>Balloon</strong></td><td style="padding:8px 0">${balloon_pct ? balloon_pct + '%' : 'None'}</td></tr>
              <tr><td style="padding:8px 0;color:#666"><strong>Est. monthly</strong></td><td style="padding:8px 0"><strong>${rand(est_monthly)}</strong></td></tr>
            </table>
            <p style="margin-top:24px;color:#999;font-size:12px">Consent given. Sent via the landcruisersa.co.za finance calculator.</p>
          `,
        }),
      });
      if (!res.ok) console.error('[finance-lead] Resend error:', await res.text());
    } catch (err) {
      console.error('[finance-lead] Resend request failed:', err);
    }
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
