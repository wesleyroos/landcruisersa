export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { valuationFeedback } from '@/db/schema';

// Where valuation feedback is emailed (both of Wesley's addresses).
const RECIPIENTS = ['wesley@landcruisersa.co.za', 'wesley@grodigital.co.za'];

const VERDICTS: Record<string, string> = {
  spot_on: 'Spot on ✅',
  too_high: 'Too high ⬆️',
  too_low: 'Too low ⬇️',
};

const esc = (s: string) => String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;');
const toInt = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : null; };
const rand = (n: number | null) => (n == null ? '—' : 'R ' + n.toLocaleString('en-ZA'));

// Light per-IP rate limit (process-local; resets on deploy) — feedback is cheap
// but the endpoint is public.
const HITS = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (HITS.get(ip) ?? []).filter(t => now - t < 10 * 60 * 1000);
  arr.push(now);
  HITS.set(ip, arr);
  if (HITS.size > 5000) for (const [k, v] of HITS) if (!v.length) HITS.delete(k);
  return arr.length > 30;
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

  // Honeypot — silently accept bots, do nothing. Named 'lcsa_hp' (not 'website').
  if (String(body.lcsa_hp ?? '').trim() !== '') {
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }
  if (rateLimited(clientIp(request))) {
    return new Response(JSON.stringify({ error: 'Too many requests.' }), { status: 429 });
  }

  const verdict = String(body.verdict ?? '').trim();
  if (!VERDICTS[verdict]) {
    return new Response(JSON.stringify({ error: 'Invalid feedback.' }), { status: 400 });
  }

  const draft_id = toInt(body.draftId);
  const model = String(body.model ?? '').trim().slice(0, 40) || null;
  const year = toInt(body.year);
  const mileage = toInt(body.mileage);
  const spec = String(body.spec ?? '').trim().slice(0, 120) || null;
  const estimate_mid = toInt(body.estimateMid);
  const user_estimate = toInt(body.userEstimate);
  const note = String(body.note ?? '').trim().slice(0, 1000) || null;
  const source_path = String(body.source_path ?? '').trim().slice(0, 120) || null;

  // DB first — never lose the calibration signal to an email hiccup.
  try {
    db.insert(valuationFeedback).values({
      draft_id, model, year, mileage, spec, estimate_mid, verdict,
      user_estimate, note, source_path, created_at: new Date(),
    }).run();
  } catch (err) {
    console.error('[valuation-feedback] DB insert failed:', err);
    return new Response(JSON.stringify({ error: 'Could not save feedback.' }), { status: 500 });
  }

  // Best-effort email to both addresses.
  const resendKey = import.meta.env.RESEND_API_KEY ?? process.env.RESEND_API_KEY ?? '';
  if (resendKey) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'noreply@landcruisersa.co.za',
          to: RECIPIENTS,
          subject: `[LCSA] Valuation feedback: ${VERDICTS[verdict]} — ${year ?? ''} ${spec || model || ''}`.trim(),
          html: `
            <h2 style="margin:0 0 16px">Valuation feedback</h2>
            <table style="border-collapse:collapse;width:100%;max-width:620px">
              <tr><td style="padding:8px 0;color:#666;width:170px"><strong>Verdict</strong></td><td style="padding:8px 0"><strong>${VERDICTS[verdict]}</strong></td></tr>
              <tr><td style="padding:8px 0;color:#666"><strong>Vehicle</strong></td><td style="padding:8px 0">${esc(spec || `${year ?? ''} ${model ?? ''}`)}</td></tr>
              <tr><td style="padding:8px 0;color:#666"><strong>Mileage</strong></td><td style="padding:8px 0">${mileage != null ? mileage.toLocaleString('en-ZA') + ' km' : '—'}</td></tr>
              <tr><td style="padding:8px 0;color:#666"><strong>Our estimate (sell)</strong></td><td style="padding:8px 0">${rand(estimate_mid)}</td></tr>
              <tr><td style="padding:8px 0;color:#666"><strong>Their figure</strong></td><td style="padding:8px 0">${rand(user_estimate)}</td></tr>
              <tr><td style="padding:8px 0;color:#666"><strong>Note</strong></td><td style="padding:8px 0">${note ? esc(note) : '—'}</td></tr>
              <tr><td style="padding:8px 0;color:#666"><strong>Snapshot / page</strong></td><td style="padding:8px 0">#${draft_id ?? '—'} · ${esc(source_path ?? '')}</td></tr>
            </table>
            <p style="margin-top:24px;color:#999;font-size:12px">Anonymous feedback from the valuation tool. Saved to valuation_feedback.</p>
          `,
        }),
      });
    } catch (err) {
      console.error('[valuation-feedback] Resend failed:', err);
    }
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
