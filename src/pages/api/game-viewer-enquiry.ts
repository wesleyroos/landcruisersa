export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { wantedRequests } from '@/db/schema';
import { rateLimited, clientIp } from '@/lib/rate-limit';

// "Looking for a game viewer?" wanted-request capture. The lead lands in OUR
// inbox with a reference ID before any dealer/builder sees it — the papered,
// auditable handoff shape every spotter-fee deal requires.
const NOTIFY_RECIPIENTS_FALLBACK = ['wesley@grodigital.co.za'];

const esc = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
const newReference = () =>
  'GV-' + Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

export const POST: APIRoute = async ({ request }) => {
  if (rateLimited(`gv-wanted:${clientIp(request)}`, 5, 60 * 60 * 1000)) {
    return new Response(JSON.stringify({ error: 'Too many requests — please try again later.' }), { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request.' }), { status: 400 });
  }

  // Honeypot: bots fill it, humans never see it. Pretend success.
  if (String(body.lcsa_hp ?? '') !== '') {
    return new Response(JSON.stringify({ ok: true, reference: newReference() }), { status: 200 });
  }

  const name = String(body.name ?? '').trim().slice(0, 120);
  const email = String(body.email ?? '').trim().slice(0, 200);
  const phone = String(body.phone ?? '').trim().slice(0, 40);
  const seats = String(body.seats ?? '').trim().slice(0, 40) || null;
  const budget = String(body.budget ?? '').trim().slice(0, 60) || null;
  const use_type = String(body.use_type ?? '').trim().slice(0, 60) || null;
  const timeline = String(body.timeline ?? '').trim().slice(0, 60) || null;
  const message = String(body.message ?? '').trim().slice(0, 2000) || null;
  const source_path = String(body.source_path ?? '').trim().slice(0, 256) || null;
  const consent = body.consent === true;

  if (!name || !email || !phone) {
    return new Response(JSON.stringify({ error: 'Name, email and phone are required.' }), { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(JSON.stringify({ error: 'Please enter a valid email address.' }), { status: 400 });
  }
  // POPIA: the whole point is routing this request to a dealer/builder —
  // never capture it without explicit consent to be contacted/referred.
  if (!consent) {
    return new Response(JSON.stringify({ error: 'Consent is required so we can send you matches.' }), { status: 400 });
  }

  const reference = newReference();
  const now = new Date();

  // DB first — the lead is the asset; never lose it to an email hiccup.
  try {
    db.insert(wantedRequests).values({
      reference,
      category: 'game-viewer',
      name, email, phone,
      seats, budget, use_type, timeline, message, source_path,
      consent_at: now,
      created_at: now,
    }).run();
  } catch (err) {
    console.error('[game-viewer-enquiry] DB insert failed:', err);
    return new Response(JSON.stringify({ error: 'Something went wrong — please try again.' }), { status: 500 });
  }

  const resendKey = import.meta.env.RESEND_API_KEY ?? process.env.RESEND_API_KEY ?? '';
  const notifyEmail = import.meta.env.NOTIFY_EMAIL ?? process.env.NOTIFY_EMAIL ?? '';
  if (resendKey) {
    const to = [...new Set([notifyEmail, ...NOTIFY_RECIPIENTS_FALLBACK].filter(Boolean))];
    const row = (label: string, value: string | null) =>
      value ? `<tr><td style="padding:8px 0;color:#666;width:140px"><strong>${label}</strong></td><td style="padding:8px 0">${esc(value)}</td></tr>` : '';
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'noreply@landcruisersa.co.za',
          to,
          reply_to: email,
          subject: `[LCSA] Game viewer WANTED (${reference}) — ${name}`,
          html: `
            <h2 style="margin:0 0 16px">Game viewer wanted — ${reference}</h2>
            <table style="border-collapse:collapse;width:100%;max-width:600px">
              ${row('Name', name)}
              <tr><td style="padding:8px 0;color:#666"><strong>Email</strong></td><td style="padding:8px 0"><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>
              <tr><td style="padding:8px 0;color:#666"><strong>Phone</strong></td><td style="padding:8px 0"><a href="tel:${esc(phone)}">${esc(phone)}</a></td></tr>
              ${row('Seats', seats)}
              ${row('Budget', budget)}
              ${row('Use', use_type)}
              ${row('Timeline', timeline)}
              ${message ? `<tr><td style="padding:8px 0;color:#666;vertical-align:top"><strong>Details</strong></td><td style="padding:8px 0;white-space:pre-wrap">${esc(message)}</td></tr>` : ''}
              ${row('Page', source_path)}
            </table>
            <p style="margin-top:24px;color:#999;font-size:12px">Quote reference ${reference} in any dealer/builder handoff. Consent to be referred: yes (POPIA).</p>
          `,
        }),
      });
      if (!res.ok) console.error('[game-viewer-enquiry] Resend error:', await res.text());
    } catch (err) {
      console.error('[game-viewer-enquiry] notify email failed (lead saved):', err);
    }
  }

  return new Response(JSON.stringify({ ok: true, reference }), { status: 200 });
};
