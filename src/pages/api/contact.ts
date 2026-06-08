export const prerender = false;

import type { APIRoute } from 'astro';

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

  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return new Response(JSON.stringify({ error: 'Name, email and message are required.' }), { status: 400 });
  }

  const subjectLabel = SUBJECT_LABELS[subject] ?? 'General Enquiry';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'noreply@landcruisersa.co.za',
      to: notifyEmail,
      reply_to: email.trim(),
      subject: `[LCSA] ${subjectLabel} from ${name.trim()}`,
      html: `
        <h2 style="margin:0 0 16px">New contact form submission</h2>
        <table style="border-collapse:collapse;width:100%;max-width:600px">
          <tr><td style="padding:8px 0;color:#666;width:120px"><strong>From</strong></td><td style="padding:8px 0">${name.trim()}</td></tr>
          <tr><td style="padding:8px 0;color:#666"><strong>Email</strong></td><td style="padding:8px 0"><a href="mailto:${email.trim()}">${email.trim()}</a></td></tr>
          <tr><td style="padding:8px 0;color:#666"><strong>Topic</strong></td><td style="padding:8px 0">${subjectLabel}</td></tr>
          <tr><td style="padding:8px 0;color:#666;vertical-align:top"><strong>Message</strong></td><td style="padding:8px 0;white-space:pre-wrap">${message.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td></tr>
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
