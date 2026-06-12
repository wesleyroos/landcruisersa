export const prerender = false;

import type { APIRoute } from 'astro';

// Lets scheduled agents email the owner WITHOUT holding mail credentials:
// the Resend key stays server-side, and the recipient is hard-fixed to
// NOTIFY_EMAIL — the only thing a caller controls is subject and body.
export const POST: APIRoute = async ({ request }) => {
  const auth = request.headers.get('authorization') ?? '';
  const ingest = import.meta.env.INGEST_TOKEN ?? process.env.INGEST_TOKEN;
  const report = import.meta.env.REPORT_TOKEN ?? process.env.REPORT_TOKEN;
  const ok = (ingest && auth === `Bearer ${ingest}`) || (report && auth === `Bearer ${report}`);
  if (!ok) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let body: { subject?: string; html?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }
  if (!body.subject || !body.html) {
    return new Response(JSON.stringify({ error: 'subject and html required' }), { status: 400 });
  }

  const RESEND_KEY = import.meta.env.RESEND_API_KEY ?? process.env.RESEND_API_KEY ?? '';
  const NOTIFY_EMAIL = import.meta.env.NOTIFY_EMAIL ?? process.env.NOTIFY_EMAIL ?? '';
  if (!RESEND_KEY || !NOTIFY_EMAIL) {
    return new Response(JSON.stringify({ error: 'Mail not configured' }), { status: 503 });
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'noreply@landcruisersa.co.za',
      to: NOTIFY_EMAIL,
      subject: String(body.subject).slice(0, 200),
      html: String(body.html).slice(0, 50_000),
    }),
  }).catch(() => null);

  return new Response(JSON.stringify({ ok: Boolean(res?.ok) }), {
    status: res?.ok ? 200 : 502,
    headers: { 'Content-Type': 'application/json' },
  });
};
