export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { enquiries } from '@/db/schema';

const SUBJECT_LABELS: Record<string, string> = {
  general: 'General Enquiry',
  listing: 'Vehicle Listing',
  training: '4x4 Training Booking',
  partnership: 'Partnership / Advertising',
  store: 'Store / Merchandise',
  technical: 'Technical Question',
  other: 'Other',
};

export const POST: APIRoute = async ({ request }) => {
  const resendKey = import.meta.env.RESEND_API_KEY ?? process.env.RESEND_API_KEY ?? '';
  const notifyEmail = import.meta.env.NOTIFY_EMAIL ?? process.env.NOTIFY_EMAIL ?? '';

  if (!resendKey || !notifyEmail) {
    return new Response(JSON.stringify({ error: 'Email service not configured.' }), { status: 500 });
  }

  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request.' }), { status: 400 });
  }

  const { name, email, subject, message } = body;
  const phone = (body.phone ?? '').toString().trim();
  const sourcePath = (body.source_path ?? '').toString().trim();
  // Where they came from BEFORE the page they submitted on. Only interesting for
  // the contact page itself, where source_path is always '/contact/' and tells us
  // nothing — the referrer is the page that actually prompted them to write in.
  const referrer = (body.referrer ?? '').toString().trim();

  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return new Response(JSON.stringify({ error: 'Name, email and message are required.' }), { status: 400 });
  }

  const subjectLabel = SUBJECT_LABELS[subject] ?? 'General Enquiry';

  // The page they were reading when they wrote in — the single most useful piece
  // of context on an enquiry ("does this include vehicles other than Land
  // Cruisers?" means something completely different from /game-viewers/ than it
  // does from a security guide). Captured all along, but it never made it into
  // the notification email, so it was invisible unless you opened /admin/inbox.
  const page = sourcePath || request.headers.get('referer') || '';
  // Same-origin referrers only: an off-site referrer here would be the search or
  // social page that sent them, which is Plausible's job, not the enquiry's.
  const cameFrom = referrer && /^https?:\/\/[^/]*landcruisersa\.co\.za\//i.test(referrer)
    ? referrer.replace(/^https?:\/\/[^/]*/i, '')
    : '';
  const pageLine = [page, cameFrom && cameFrom !== page ? `(arrived from ${cameFrom})` : '']
    .filter(Boolean).join(' ');
  // `page` is a path from the form but an absolute URL when it fell back to the
  // referer header — normalise before building the link.
  const pageHref = /^https?:\/\//i.test(page)
    ? page
    : `https://landcruisersa.co.za${page.startsWith('/') ? page : `/${page}`}`;

  // Best-effort capture to the inbox (chat widget + contact page both POST here).
  // Wrapped so a DB hiccup can NEVER affect the email path below.
  try {
    db.insert(enquiries).values({
      name: name.trim(),
      email: email.trim(),
      phone: phone || null,
      message: message.trim(),
      source_path: page || `contact:${subject || 'general'}`,
      created_at: new Date(),
    }).run();
  } catch (err) {
    console.error('[contact] enquiries insert failed (non-fatal):', err);
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'noreply@landcruisersa.co.za',
      to: [notifyEmail, 'wesley@grodigital.co.za'],
      reply_to: email.trim(),
      subject: `[LCSA] ${subjectLabel} from ${name.trim()}`,
      html: `
        <h2 style="margin:0 0 16px">New contact form submission</h2>
        <table style="border-collapse:collapse;width:100%;max-width:600px">
          <tr><td style="padding:8px 0;color:#666;width:120px"><strong>From</strong></td><td style="padding:8px 0">${name.trim()}</td></tr>
          <tr><td style="padding:8px 0;color:#666"><strong>Email</strong></td><td style="padding:8px 0"><a href="mailto:${email.trim()}">${email.trim()}</a></td></tr>
          ${phone ? `<tr><td style="padding:8px 0;color:#666"><strong>Phone</strong></td><td style="padding:8px 0">${phone.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td></tr>` : ''}
          <tr><td style="padding:8px 0;color:#666"><strong>Topic</strong></td><td style="padding:8px 0">${subjectLabel}</td></tr>
          <tr><td style="padding:8px 0;color:#666;vertical-align:top"><strong>Message</strong></td><td style="padding:8px 0;white-space:pre-wrap">${message.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td></tr>
          ${pageLine ? `<tr><td style="padding:8px 0;color:#666"><strong>Page</strong></td><td style="padding:8px 0"><a href="${encodeURI(pageHref)}">${pageLine.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</a></td></tr>` : ''}
        </table>
        <p style="margin-top:24px;color:#999;font-size:12px">Sent via landcruisersa.co.za contact form</p>
      `,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[contact] Resend error:', err);
    return new Response(JSON.stringify({ error: 'Failed to send message.' }), { status: 502 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
