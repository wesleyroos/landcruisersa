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

// Minimal self-contained pages for the no-JS / native-form-POST fallback path
// (when the JS fetch is blocked by an extension, the form submits classically).
const page = (title: string, body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — Land Cruiser SA</title><style>body{font-family:system-ui,-apple-system,sans-serif;background:#F5F3EE;color:#111;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:1.5rem}.c{background:#fff;border:1px solid #DDD9D3;border-radius:.9rem;padding:2rem;max-width:420px;text-align:center}h1{font-size:1.3rem;margin:0 0 .5rem}p{color:#4A4A4A;line-height:1.5}a{display:inline-block;margin-top:1.2rem;background:#F5A623;color:#111;font-weight:700;text-decoration:none;padding:.7rem 1.3rem;border-radius:.5rem}</style></head><body><div class="c">${body}</div></body></html>`;
const THANKS = page('Message sent', '<h1>Message sent 🙌</h1><p>Thanks — we\'ll be in touch soon.</p><a href="/">Back to Land Cruiser SA</a>');

export const POST: APIRoute = async ({ request }) => {
  const ct = request.headers.get('content-type') || '';
  const isForm = !ct.includes('application/json'); // native form fallback vs JS fetch

  // Response helpers — HTML for the native path, JSON for the fetch path.
  const ok = () => isForm
    ? new Response(THANKS, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    : new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const fail = (msg: string, code: number) => isForm
    ? new Response(page('Sorry', `<h1>Couldn't send that</h1><p>${esc(msg)}</p><a href="/">Back</a>`), { status: code, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    : new Response(JSON.stringify({ error: msg }), { status: code, headers: { 'Content-Type': 'application/json' } });

  let body: Record<string, unknown>;
  try {
    if (isForm) {
      const fd = await request.formData();
      body = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
    } else {
      body = await request.json();
    }
  } catch {
    return fail('Invalid request.', 400);
  }

  // Honeypot — named 'lcsa_hp' (NOT 'website') so browser autofill can't trip it.
  if (String(body.lcsa_hp ?? '').trim() !== '') return ok();
  if (rateLimited(clientIp(request))) return fail('Too many messages — please try again shortly.', 429);

  const name = String(body.name ?? '').trim().slice(0, 120);
  const phone = String(body.phone ?? '').trim().slice(0, 40);
  const email = String(body.email ?? '').trim().slice(0, 160);
  const message = String(body.message ?? '').trim().slice(0, 2000);
  const source_path = String(body.source_path ?? '').trim().slice(0, 160) || null;

  if (!name || !message) return fail('Please add your name and a message.', 400);
  if (!phone && !email) return fail('Please leave a phone number or email so we can reply.', 400);

  // DB first — never lose an enquiry to an email hiccup.
  try {
    db.insert(enquiries).values({ name, phone: phone || null, email: email || null, message, source_path, created_at: new Date() }).run();
  } catch (err) {
    console.error('[enquiry] DB insert failed:', err);
    return fail('Could not send your message. Please try again.', 500);
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

  return ok();
};
