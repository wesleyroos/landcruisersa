export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { enquiries } from '@/db/schema';

const RECIPIENTS = ['wesley@landcruisersa.co.za', 'wesley@grodigital.co.za'];
const esc = (s: string) => String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Per-IP rate limit (process-local; resets on deploy).
const HITS = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (HITS.get(ip) ?? []).filter(t => now - t < 10 * 60 * 1000);
  arr.push(now);
  HITS.set(ip, arr);
  if (HITS.size > 5000) for (const [k, v] of HITS) if (!v.length) HITS.delete(k);
  return arr.length > 8;
}
const clientIp = (request: Request) =>
  request.headers.get('fly-client-ip')
  || (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim()
  || 'unknown';

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid request.' }), { status: 400 });
  }

  // Honeypot — silently accept bots.
  if (String(body.website ?? '').trim() !== '') {
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }
  if (rateLimited(clientIp(request))) {
    return new Response(JSON.stringify({ error: 'Too many messages — please try again shortly.' }), { status: 429 });
  }

  const name = String(body.name ?? '').trim().slice(0, 120);
  const phone = String(body.phone ?? '').trim().slice(0, 40);
  const email = String(body.email ?? '').trim().slice(0, 160);
  const message = String(body.message ?? '').trim().slice(0, 2000);
  const source_path = String(body.source_path ?? '').trim().slice(0, 160) || null;

  if (!name || !message) {
    return new Response(JSON.stringify({ error: 'Please add your name and a message.' }), { status: 400 });
  }
  if (!phone && !email) {
    return new Response(JSON.stringify({ error: 'Please leave a phone number or email so we can reply.' }), { status: 400 });
  }

  // DB first — never lose an enquiry to an email hiccup.
  try {
    db.insert(enquiries).values({ name, phone: phone || null, email: email || null, message, source_path, created_at: new Date() }).run();
  } catch (err) {
    console.error('[enquiry] DB insert failed:', err);
    return new Response(JSON.stringify({ error: 'Could not send your message. Please try again.' }), { status: 500 });
  }

  const resendKey = import.meta.env.RESEND_API_KEY ?? process.env.RESEND_API_KEY ?? '';
  if (resendKey) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'noreply@landcruisersa.co.za',
          to: RECIPIENTS,
          reply_to: email || undefined,
          subject: `[LCSA] Enquiry — ${name}`,
          html: `
            <h2 style="margin:0 0 16px">New enquiry (chat widget)</h2>
            <table style="border-collapse:collapse;width:100%;max-width:600px">
              <tr><td style="padding:8px 0;color:#666;width:140px"><strong>Name</strong></td><td style="padding:8px 0">${esc(name)}</td></tr>
              <tr><td style="padding:8px 0;color:#666"><strong>Phone</strong></td><td style="padding:8px 0">${phone ? esc(phone) : '—'}</td></tr>
              <tr><td style="padding:8px 0;color:#666"><strong>Email</strong></td><td style="padding:8px 0">${email ? `<a href="mailto:${esc(email)}">${esc(email)}</a>` : '—'}</td></tr>
              <tr><td style="padding:8px 0;color:#666"><strong>Message</strong></td><td style="padding:8px 0;white-space:pre-wrap">${esc(message)}</td></tr>
              <tr><td style="padding:8px 0;color:#666"><strong>Page</strong></td><td style="padding:8px 0">${esc(source_path ?? '')}</td></tr>
            </table>
          `,
        }),
      });
    } catch (err) {
      console.error('[enquiry] Resend failed:', err);
    }
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
