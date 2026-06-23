export const prerender = false;

import type { APIRoute } from 'astro';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '@/db/index';
import { valuationCertificates } from '@/db/schema';
import { valuate } from '@/lib/valuation';
import { VALUATION_MODEL_SLUG_SET, MODEL_YEAR_RANGE, modelLabel } from '@/lib/sources/normalize';
import { valuationRequests } from '@/db/schema';
import { isSpecValue, specLabel } from '@/lib/spec';
import {
  mintCertId, buildCertificateHtml, renderPdf, sendCertificateEmail, type CertificateData,
} from '@/lib/certificate';

const CUR_YEAR = new Date().getFullYear();
const SITE = process.env.SITE_URL ?? 'https://landcruisersa.co.za';
const VALID_DAYS = 30;

// Dedicated, tighter per-IP limit — each call can cost a PDFShift credit.
const HITS = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_HITS = 6;
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (HITS.get(ip) ?? []).filter(t => now - t < WINDOW_MS);
  arr.push(now);
  HITS.set(ip, arr);
  if (HITS.size > 5000) {
    for (const [k, v] of HITS) if (!v.some(t => now - t < WINDOW_MS)) HITS.delete(k);
  }
  return arr.length > MAX_HITS;
}
const clientIp = (request: Request) =>
  request.headers.get('fly-client-ip')
  || (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim()
  || 'unknown';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid request.' }, 400); }

  // Honeypot — silent ack.
  if (String(body.lcsa_hp ?? '').trim() !== '') return json({ ok: true });

  if (rateLimited(clientIp(request))) {
    return json({ error: 'Too many requests. Please try again in a minute.' }, 429);
  }

  // Validate identically to /api/valuation.
  const model = String(body.model ?? '').trim();
  const year = Math.round(Number(body.year));
  const mileage = Math.round(Number(body.mileage));
  const conditionRaw = String(body.condition ?? 'good').trim();
  const condition = (['excellent', 'good', 'fair', 'rough'].includes(conditionRaw) ? conditionRaw : 'good') as
    'excellent' | 'good' | 'fair' | 'rough';
  const province = String(body.province ?? '').trim() || null;
  const draftId = Number.isFinite(Number(body.draftId)) ? Math.round(Number(body.draftId)) : null;
  const utm_source = String(body.utm_source ?? '').trim().slice(0, 32) || null;
  const source_path = String(body.source_path ?? '').trim().slice(0, 120) || null;
  const name = String(body.name ?? '').trim().slice(0, 120);
  const phone = String(body.phone ?? '').trim().slice(0, 40);
  const emailRaw = String(body.email ?? '').trim().slice(0, 160);
  const consent = body.consent === true;
  const dealerOptin = body.dealer === true || body.dealer_offer_optin === true;

  if (!VALUATION_MODEL_SLUG_SET.has(model)) return json({ error: 'Please choose a Land Cruiser or Toyota 4x4 model.' }, 400);
  const [rMin, rMax] = MODEL_YEAR_RANGE[model] ?? [1980, CUR_YEAR + 1];
  const minY = rMin, maxY = Math.min(rMax, CUR_YEAR + 1);
  if (!Number.isFinite(year) || year < minY || year > maxY) {
    return json({ error: `The ${modelLabel(model)} was sold from ${minY} to ${maxY} — please pick a year in that range.` }, 400);
  }
  if (!Number.isFinite(mileage) || mileage < 0 || mileage > 600000) {
    return json({ error: 'Please enter mileage between 0 and 600,000 km.' }, 400);
  }

  // Contact details are REQUIRED — the certificate is a gated lead and we email
  // the user a copy, so name + phone + email + consent must all be present.
  if (!name) return json({ error: 'Please enter your name.' }, 400);
  if (phone.replace(/\D/g, '').length < 7) return json({ error: 'Please enter a valid phone number.' }, 400);
  if (!emailRaw.includes('@') || emailRaw.length < 5) return json({ error: 'Please enter a valid email — we email your certificate to you.' }, 400);
  if (!consent) return json({ error: 'Please tick the consent box so we can send your certificate.' }, 400);

  const pick = (axis: 'engine' | 'grade' | 'body') => {
    const val = String(body[axis] ?? '').trim();
    return val && isSpecValue(model, axis, val) ? val : undefined;
  };
  const engine = pick('engine'), grade = pick('grade'), bodyspec = pick('body');

  // Dedup: an unexpired cert already issued off this draft → return it, no re-render.
  if (draftId) {
    try {
      const existing = db.select().from(valuationCertificates)
        .where(and(eq(valuationCertificates.draft_id, draftId), gt(valuationCertificates.expires_at, new Date())))
        .limit(1).all();
      const row = existing[0];
      if (row?.pdf_url) {
        return json({
          ok: true, certId: row.cert_id, pdfUrl: row.pdf_url,
          verifyUrl: `${SITE}/valuation/certificate/${row.cert_id}`,
          expiresAt: Math.floor(row.expires_at.getTime() / 1000),
        });
      }
    } catch (err) { console.error('[cert] dedup lookup failed:', err); }
  }

  // Recompute server-side — never trust client-sent prices.
  const v = valuate({ model, year, mileage, condition, province: province ?? undefined, engine, grade, body: bodyspec });
  if (!v.available) return json({ error: 'No certifiable estimate for this vehicle yet.' }, 400);

  const certId = mintCertId();
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + VALID_DAYS * 24 * 60 * 60 * 1000);
  const verifyUrl = `${SITE}/valuation/certificate/${certId}`;

  const certData: CertificateData = {
    certId, issuedAt, expiresAt,
    year, modelLabel: modelLabel(model), specLabel: specLabel(model, { engine, grade, body: bodyspec }),
    mileage, condition, province,
    sellLow: v.sellLow, sellMid: v.sellMid, sellHigh: v.sellHigh, askingCeiling: v.askingCeiling,
    confidence: v.confidence,
    cohortSize: v.cohort.size, cohortLabel: v.cohort.label,
    cohortMedian: v.cohort.medianPrice, cohortP25: v.cohort.p25, cohortP75: v.cohort.p75,
    verifyUrl,
  };

  // Render → PDF. A render failure must not persist a row.
  let pdf: Buffer;
  try {
    pdf = await renderPdf(buildCertificateHtml(certData));
  } catch (err) {
    console.error('[cert] PDFShift render failed:', err);
    return json({ error: 'Certificate service unavailable, please retry.' }, 502);
  }

  // Store to R2 (cache by cert_id). If R2 isn't configured, fall back to streaming
  // is out of scope — we surface a clear error rather than a dead link.
  const { putToR2 } = await import('@/lib/sources/r2');
  const pdfUrl = await putToR2(`certificates/${certId}.pdf`, pdf, 'application/pdf');
  if (!pdfUrl) {
    console.error('[cert] R2 not configured / upload failed for', certId);
    return json({ error: 'Could not store the certificate, please retry.' }, 502);
  }

  // Always email the certificate (email is required). Best-effort — a Resend
  // failure must not fail the request; the user still has the download.
  let emailedAt: Date | null = null;
  const sent = await sendCertificateEmail(emailRaw, certData, pdf).catch(() => false);
  if (sent) emailedAt = new Date();

  // Persist the receipt + captured lead (best-effort — still return the PDF if
  // the insert hiccups).
  try {
    db.insert(valuationCertificates).values({
      cert_id: certId, draft_id: draftId,
      model, year, mileage, condition, province,
      spec_label: certData.specLabel || null, cohort_label: v.cohort.label,
      sell_low: v.sellLow, sell_mid: v.sellMid, sell_high: v.sellHigh, asking_ceiling: v.askingCeiling,
      confidence: v.confidence,
      cohort_size: v.cohort.size, cohort_p25: v.cohort.p25, cohort_p75: v.cohort.p75, cohort_p90: v.cohort.p90,
      pdf_url: pdfUrl, issued_at: issuedAt, expires_at: expiresAt,
      name, phone, email: emailRaw, consent_at: issuedAt, emailed_at: emailedAt,
      dealer_offer_optin: dealerOptin,
      source_path, utm_source,
    }).run();
  } catch (err) {
    console.error('[cert] certificate insert failed:', err);
  }

  // Mirror the contact onto the canonical lead row (valuation_requests) so the
  // dealer-sourcing loop + admin lead views see it. Best-effort, only if linked.
  if (draftId) {
    try {
      db.update(valuationRequests).set({
        name, phone, email: emailRaw, consent: true,
        dealer_offer_optin: dealerOptin,
      }).where(eq(valuationRequests.id, draftId)).run();
    } catch (err) { console.error('[cert] draft lead update failed:', err); }
  }

  return json({
    ok: true, certId, pdfUrl, verifyUrl,
    expiresAt: Math.floor(expiresAt.getTime() / 1000),
    emailed: Boolean(emailedAt),
  });
};
