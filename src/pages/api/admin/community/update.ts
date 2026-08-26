export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { communityBuilds } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin, unauthorized } from '@/lib/admin-auth';

// Which market strips a build's /builds page may show — the LC model slugs the
// snapshot understands (see site-stats MODEL_LABELS); anything else → null =
// all Cruisers.
const MARKET_MODELS = new Set([
  '79-series', '76-series', '78-series', '70-series', '80-series', '100-series',
  '200-series', '300-series', 'prado-90', 'prado-120', 'prado-150', 'prado-250',
  'fj-cruiser', '40-series', '55-series', '60-series', 'land-cruiser-fj',
]);

// Edit a draft's caption / credit / status / schedule, or delete it.
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!requireAdmin(cookies)) return unauthorized();
  let b: any; try { b = await request.json(); } catch { return new Response('{}', { status: 400 }); }
  const id = Number(b.id);
  if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });

  if (b.action === 'delete') {
    db.delete(communityBuilds).where(eq(communityBuilds.id, id)).run();
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  const updates: Record<string, unknown> = {};
  if (typeof b.caption === 'string') updates.caption = b.caption;
  if (typeof b.credit_handle === 'string') updates.credit_handle = b.credit_handle.replace(/^@/, '').trim().toLowerCase();
  if (typeof b.location === 'string') updates.location = b.location || null;
  if ('market_model' in b) updates.market_model = MARKET_MODELS.has(b.market_model) ? b.market_model : null;
  if (typeof b.featured === 'boolean') updates.featured = b.featured;
  if (b.status && ['draft', 'queued', 'skipped'].includes(b.status)) updates.status = b.status;
  if ('scheduled_for' in b) updates.scheduled_for = b.scheduled_for ? new Date(b.scheduled_for) : null;

  // Carousel editing: the client sends the kept slide URLs (removed junk / new
  // cover order). Only accept URLs that are already on this build — no arbitrary
  // images. First = the cover; single left → clear the array.
  if (Array.isArray(b.images)) {
    const cur = db.select({ image_url: communityBuilds.image_url, images: communityBuilds.images }).from(communityBuilds).where(eq(communityBuilds.id, id)).get();
    if (cur) {
      let existing: string[] = [cur.image_url];
      try { const a = JSON.parse(cur.images ?? 'null'); if (Array.isArray(a) && a.length) existing = a; } catch { /* cover only */ }
      const kept = b.images.map(String).filter((u: string) => existing.includes(u));
      if (kept.length) {
        updates.image_url = kept[0];
        updates.images = kept.length > 1 ? JSON.stringify(kept) : null;
      }
    }
  }

  if (Object.keys(updates).length === 0) return new Response(JSON.stringify({ error: 'nothing to update' }), { status: 400 });

  db.update(communityBuilds).set(updates).where(eq(communityBuilds.id, id)).run();
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
