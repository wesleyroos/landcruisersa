export const prerender = false;

import type { APIRoute } from 'astro';
import { isAdminSession } from '@/lib/track-guard';
import { db } from '@/db/index';
import { rentalClicks } from '@/db/schema';
import { RENTAL_OPERATORS } from '@/data/rental-operators';

// First-party tracking of outbound clicks to rental operators — our own demand
// data (which operators users want), NOT lead-gen / referral attribution. No UTM.
const VALID_SLUGS = new Set(RENTAL_OPERATORS.map((o) => o.slug));
const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|fetch|monitor|headless/i;

export const POST: APIRoute = async ({ request, cookies }) => {
  if (isAdminSession(cookies)) return new Response(null, { status: 204 });
  const ua = request.headers.get('user-agent') ?? '';
  if (BOT_UA.test(ua)) return new Response(null, { status: 204 });

  let body: { operator_slug?: string };
  try { body = await request.json(); } catch {
    return new Response('', { status: 400 });
  }

  const { operator_slug } = body;
  if (!operator_slug || !VALID_SLUGS.has(operator_slug)) {
    return new Response('', { status: 400 });
  }

  try {
    db.insert(rentalClicks).values({ operator_slug, created_at: new Date() }).run();
  } catch (err) {
    console.error('[track-rental] DB insert failed:', err);
  }

  return new Response(null, { status: 204 });
};
