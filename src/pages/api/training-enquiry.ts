export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { syncContactsToEngage, trackEngageEvent, submissionToEngageContact } from '@/lib/integrations/engage';
import { trainingLeads } from '@/db/schema';

export const POST: APIRoute = async ({ request }) => {
  const resendKey = import.meta.env.RESEND_API_KEY ?? process.env.RESEND_API_KEY ?? '';

  if (!resendKey) {
    return new Response(JSON.stringify({ error: 'Email service not configured.' }), { status: 500 });
  }

  const trainingRecipients = [
    'info@tad-sa.co.za',
    'wesley@landcruisersa.co.za',
    'wesley@grodigital.co.za',
    'salve@tad-sa.co.za',
    'paul@tad-sa.co.za',
  ];

  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request.' }), { status: 400 });
  }

  const { 'first-name': firstName, surname, email, phone, location, 'land-cruiser': landCruiser, message } = body;

  if (!firstName?.trim() || !email?.trim() || !phone?.trim()) {
    return new Response(JSON.stringify({ error: 'Name, email and phone are required.' }), { status: 400 });
  }

  const name = `${firstName.trim()} ${surname?.trim() ?? ''}`.trim();

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'noreply@landcruisersa.co.za',
      to: trainingRecipients,
      reply_to: email.trim(),
      subject: `[LCSA] Training Enquiry from ${name}`,
      html: `
        <h2 style="margin:0 0 16px">New training course enquiry</h2>
        <table style="border-collapse:collapse;width:100%;max-width:600px">
          <tr><td style="padding:8px 0;color:#666;width:140px"><strong>Name</strong></td><td style="padding:8px 0">${name}</td></tr>
          <tr><td style="padding:8px 0;color:#666"><strong>Email</strong></td><td style="padding:8px 0"><a href="mailto:${email.trim()}">${email.trim()}</a></td></tr>
          <tr><td style="padding:8px 0;color:#666"><strong>Phone</strong></td><td style="padding:8px 0">${phone.trim()}</td></tr>
          ${location?.trim() ? `<tr><td style="padding:8px 0;color:#666"><strong>Location</strong></td><td style="padding:8px 0">${location.trim()}</td></tr>` : ''}
          ${landCruiser?.trim() ? `<tr><td style="padding:8px 0;color:#666"><strong>Land Cruiser</strong></td><td style="padding:8px 0">${landCruiser.trim()}</td></tr>` : ''}
          ${message?.trim() ? `<tr><td style="padding:8px 0;color:#666;vertical-align:top"><strong>Message</strong></td><td style="padding:8px 0;white-space:pre-wrap">${message.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td></tr>` : ''}
        </table>
        <p style="margin-top:24px;color:#999;font-size:12px">Sent via landcruisersa.co.za training enquiry form</p>
      `,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[training-enquiry] Resend error:', err);
    return new Response(JSON.stringify({ error: 'Failed to send enquiry.' }), { status: 502 });
  }

  try {

  // A checkbox reaches here three different ways depending on the form:


  // a JSON boolean, "true", or "on" from Object.fromEntries(FormData).


  // Absent means unticked.


  const consent = ['true', 'on', '1'].includes(String(body?.consent ?? '').toLowerCase());
    db.insert(trainingLeads).values({
      name,
      email: email.trim(),
      phone: phone.trim(),
      location: location?.trim() || null,
      land_cruiser: landCruiser?.trim() || null,
      message: message?.trim() || null,
      created_at: new Date(),
      ...(consent ? { consent_at: new Date(), consent_source: 'training-enquiry' } : {}),
    }).run();

    syncContactsToEngage(
      submissionToEngageContact({
        name, email, phone, source: 'training-enquiry', consent,
        traits: { lcsa_location: location?.trim() || null, lcsa_land_cruiser: landCruiser?.trim() || null },
      }) ?? [],
    );
    trackEngageEvent('training_enquiry', {
      email, phone,
      properties: { location: location?.trim() || null, landCruiser: landCruiser?.trim() || null },
    });
  } catch (err) {
    console.error('[training-enquiry] DB insert failed:', err);
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
