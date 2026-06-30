export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { valuationRequests } from '@/db/schema';
import { valuate, VALUATION_DISCLAIMER } from '@/lib/valuation';
import { VALUATION_MODEL_SLUG_SET, MODEL_YEAR_RANGE, modelLabel } from '@/lib/sources/normalize';
import { isSpecValue } from '@/lib/spec';

const CUR_YEAR = new Date().getFullYear();

// In-memory per-IP rate limit. Process-local: resets on the ~45s deploy and
// would not survive a future 2nd Fly machine (needs a Turso migration first) —
// acceptable for v1 on a single machine.
const HITS = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_HITS = 20;
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

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request.' }), { status: 400 });
  }

  // Honeypot — a filled hidden field means a bot. Ack silently, do nothing.
  // Named 'lcsa_hp' (NOT 'website') so browser autofill can't trip it.
  if (String(body.lcsa_hp ?? '').trim() !== '') {
    return new Response(JSON.stringify({ ok: true, estimate: null }), { status: 200 });
  }

  if (rateLimited(clientIp(request))) {
    return new Response(JSON.stringify({ error: 'Too many requests. Please try again in a minute.' }), { status: 429 });
  }

  const model = String(body.model ?? '').trim();
  const year = Math.round(Number(body.year));
  const mileage = Math.round(Number(body.mileage));
  const conditionRaw = String(body.condition ?? 'good').trim();
  const condition = (['excellent', 'good', 'fair', 'rough'].includes(conditionRaw) ? conditionRaw : 'good') as
    'excellent' | 'good' | 'fair' | 'rough';
  const province = String(body.province ?? '').trim() || null;
  const utm_source = String(body.utm_source ?? '').trim().slice(0, 32) || null;
  const source_path = String(body.source_path ?? '').trim().slice(0, 120) || null;
  // Anonymous per-browser id — groups repeat valuations from the same person.
  const client_id = String(body.client_id ?? '').trim().slice(0, 64) || null;

  if (!VALUATION_MODEL_SLUG_SET.has(model)) {
    return new Response(JSON.stringify({ error: 'Please choose a Land Cruiser model.' }), { status: 400 });
  }
  const [rMin, rMax] = MODEL_YEAR_RANGE[model] ?? [1980, CUR_YEAR + 1];
  const minY = rMin, maxY = Math.min(rMax, CUR_YEAR + 1);
  if (!Number.isFinite(year) || year < minY || year > maxY) {
    return new Response(JSON.stringify({ error: `The ${modelLabel(model)} was sold from ${minY} to ${maxY} — please pick a year in that range.` }), { status: 400 });
  }
  if (!Number.isFinite(mileage) || mileage < 0 || mileage > 600000) {
    return new Response(JSON.stringify({ error: 'Please enter mileage between 0 and 600,000 km.' }), { status: 400 });
  }

  // Spec (optional) — sanitise against the model's real options; drop anything unknown.
  const pick = (axis: 'engine' | 'grade' | 'body') => {
    const val = String(body[axis] ?? '').trim();
    return val && isSpecValue(model, axis, val) ? val : undefined;
  };
  const engine = pick('engine'), grade = pick('grade'), bodyspec = pick('body');

  const v = valuate({ model, year, mileage, condition, province: province ?? undefined, engine, grade, body: bodyspec });

  // Anonymous snapshot — best-effort; never block the estimate on a write hiccup.
  let draftId: number | null = null;
  try {
    const res = db.insert(valuationRequests).values({
      model, year, mileage, province, condition,
      sell_low:       v.available ? v.sellLow : null,
      sell_mid:       v.available ? v.sellMid : null,
      sell_high:      v.available ? v.sellHigh : null,
      asking_ceiling: v.available ? v.askingCeiling : null,
      confidence:     v.confidence,
      cohort_size:    v.available ? v.cohort.size : v.cohortSize,
      cohort_label:   v.available ? v.cohort.label : null,
      anchor_basis:   v.available ? v.cohort.anchorBasis : null,
      source: 'valuation_tool', source_path, utm_source, client_id,
      created_at: new Date(),
    }).run();
    draftId = Number(res.lastInsertRowid);
  } catch (err) {
    console.error('[valuation] snapshot insert failed:', err);
  }

  if (!v.available) {
    return new Response(JSON.stringify({
      ok: true, draftId, estimate: null, confidence: 'none',
      cohort: { label: v.modelLabel, size: v.cohortSize, modelSupply: v.modelSupply },
      caveat: `We track too few comparable ${v.modelLabel} right now for an honest range. Leave your details and a specialist will value it manually.`,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({
    ok: true, draftId,
    estimate: {
      sellLow: v.sellLow, sellMid: v.sellMid, sellHigh: v.sellHigh,
      askingCeiling: v.askingCeiling, confidence: v.confidence,
      confidenceReasons: v.confidenceReasons, currency: 'ZAR',
    },
    cohort: {
      label: v.cohort.label, size: v.cohort.size, medianPrice: v.cohort.medianPrice,
      p25: v.cohort.p25, p75: v.cohort.p75, p90: v.cohort.p90,
      avgMileage: v.cohort.avgMileage, modelSupply: v.cohort.modelSupply, anchorBasis: v.cohort.anchorBasis,
    },
    caveat: VALUATION_DISCLAIMER,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
