export const prerender = false;

import type { APIRoute } from 'astro';
import { isAdminSession } from '@/lib/track-guard';
import { db } from '@/db/index';
import { searchQueries } from '@/db/schema';

// Logs a natural-language vehicle search: the raw query + parsed filters +
// result count. First-party intent + demand-gap data (result_count=0 → wanted
// but out of stock). Fire-and-forget beacon; own clicks + bots dropped.
const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|fetch|monitor|headless/i;
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);
const csv = (v: unknown): string | null => (Array.isArray(v) && v.length ? v.map(String).join(',').slice(0, 200) : null);

export const POST: APIRoute = async ({ request, cookies }) => {
  if (isAdminSession(cookies)) return new Response(null, { status: 204 });
  const ua = request.headers.get('user-agent') ?? '';
  if (BOT_UA.test(ua)) return new Response(null, { status: 204 });

  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return new Response('', { status: 400 }); }

  const q = typeof b.q === 'string' ? b.q.trim().slice(0, 200) : '';
  if (!q) return new Response('', { status: 400 });

  try {
    db.insert(searchQueries).values({
      q,
      mode: b.mode === 'filter' ? 'filter' : 'navigate',
      models: csv(b.models),
      provinces: csv(b.provinces),
      min_price: int(b.min_price),
      max_price: int(b.max_price),
      min_mileage: int(b.min_mileage),
      max_mileage: int(b.max_mileage),
      min_year: int(b.min_year),
      max_year: int(b.max_year),
      matched: b.matched === true,
      result_count: int(b.result_count),
      client_id: typeof b.client_id === 'string' ? b.client_id.slice(0, 64) : null,
      created_at: new Date(),
    }).run();
  } catch (err) {
    console.error('[search-log] DB insert failed:', err);
  }

  return new Response(null, { status: 204 });
};
