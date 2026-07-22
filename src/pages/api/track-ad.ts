export const prerender = false;

import type { APIRoute } from 'astro';
import { isAdminSession } from '@/lib/track-guard';
import { db } from '@/db/index';
import { adEvents } from '@/db/schema';

// Sponsored-placement beacon: viewable impressions + clicks per slot variant.
// Mirrors track-click's guards (admin + bot filtered) so the numbers we
// report to advertisers are honest.
const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|fetch|monitor|headless/i;
const KINDS = ['impression', 'click'];
const VARIANTS = ['leaderboard', 'rectangle'];

export const POST: APIRoute = async ({ request, cookies }) => {
  if (isAdminSession(cookies)) return new Response(null, { status: 204 });
  const ua = request.headers.get('user-agent') ?? '';
  if (BOT_UA.test(ua)) return new Response(null, { status: 204 });

  let body: { kind?: string; variant?: string; listing_slug?: string; client_id?: string };
  try { body = await request.json(); } catch {
    return new Response('', { status: 400 });
  }

  const { kind, variant, listing_slug, client_id } = body;
  if (!kind || !KINDS.includes(kind) || !variant || !VARIANTS.includes(variant)) {
    return new Response('', { status: 400 });
  }

  try {
    db.insert(adEvents).values({
      advertiser: 'titan',
      kind,
      variant,
      listing_slug: (listing_slug || '').slice(0, 256) || null,
      client_id: client_id ? String(client_id).slice(0, 64) : null,
      created_at: new Date(),
    }).run();
  } catch (err) {
    console.error('[track-ad] insert failed:', err);
  }

  return new Response(null, { status: 204 });
};
