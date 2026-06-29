export const prerender = false;
import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { savedSearches } from '@/db/schema';
import { getCurrentUser, unauthorized } from '@/lib/auth-user';
import { sameOrigin } from '@/lib/http-guards';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

// Normalise an array (or single value) of strings into a capped, trimmed CSV.
function csv(v: unknown): string {
  const arr = Array.isArray(v) ? v : (v != null ? [v] : []);
  const clean = arr.map(x => String(x).trim()).filter(Boolean).slice(0, 20);
  return clean.join(',');
}
function posInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}
const pretty = (m: string) => m.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

function buildLabel(o: {
  models: string; provinces: string; price_min: number | null; price_max: number | null;
  year_min: number | null; year_max: number | null;
}): string {
  const parts: string[] = [];
  parts.push(o.models ? o.models.split(',').map(pretty).join(', ') : 'Any Land Cruiser');
  if (o.year_min || o.year_max) parts.push(`${o.year_min ?? '…'}–${o.year_max ?? '…'}`);
  if (o.price_min || o.price_max) {
    const lo = o.price_min ? 'R' + o.price_min.toLocaleString('en-ZA') : 'R0';
    const hi = o.price_max ? 'R' + o.price_max.toLocaleString('en-ZA') : 'any';
    parts.push(`${lo}–${hi}`);
  }
  if (o.provinces) parts.push(o.provinces.split(',').join(', '));
  return parts.join(' · ');
}

// Create a saved search.
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!sameOrigin(request)) return json({ error: 'Bad origin' }, 403);
  const user = getCurrentUser(cookies);
  if (!user) return unauthorized();

  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { /* tolerate */ }

  const models = csv(body.model);
  const provinces = csv(body.province);
  const price_min = posInt(body.price_min);
  const price_max = posInt(body.price_max);
  const year_min = posInt(body.year_min);
  const year_max = posInt(body.year_max);

  // Refuse a criteria-less search — it would match the whole inventory and spam.
  if (!models && !provinces && !price_min && !price_max && !year_min && !year_max) {
    return json({ error: 'Add at least one filter before saving a search.' }, 400);
  }

  // Cap saved searches per user to keep the daily sweep bounded.
  const count = db.select({ id: savedSearches.id }).from(savedSearches)
    .where(and(eq(savedSearches.user_id, user.id), eq(savedSearches.active, true))).all().length;
  if (count >= 20) return json({ error: "You've reached the maximum of 20 saved searches." }, 400);

  const label = buildLabel({ models, provinces, price_min, price_max, year_min, year_max });
  const [row] = db.insert(savedSearches).values({
    user_id: user.id,
    label,
    model: models || null,
    province: provinces || null,
    price_min, price_max, year_min, year_max,
    segment: 'land-cruiser',
    active: true,
    created_at: new Date(),
  }).returning().all();

  return json({ ok: true, id: row.id, label });
};

// Remove a saved search (scoped to the owner).
export const DELETE: APIRoute = async ({ request, cookies }) => {
  if (!sameOrigin(request)) return json({ error: 'Bad origin' }, 403);
  const user = getCurrentUser(cookies);
  if (!user) return unauthorized();

  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { /* tolerate */ }
  const id = posInt(body.id);
  if (!id) return json({ error: 'Missing id' }, 400);

  db.delete(savedSearches).where(and(eq(savedSearches.id, id), eq(savedSearches.user_id, user.id))).run();
  return json({ ok: true });
};
