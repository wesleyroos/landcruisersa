export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { partnerClicks } from '@/db/schema';
import { PARTNERS } from '@/data/partners';

const VALID_KINDS = ['website', 'email', 'instagram'];
const VALID_SLUGS = new Set(PARTNERS.map(p => p.slug));
const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|fetch|monitor|headless/i;

export const POST: APIRoute = async ({ request }) => {
  const ua = request.headers.get('user-agent') ?? '';
  if (BOT_UA.test(ua)) return new Response(null, { status: 204 });

  let body: { partner_slug?: string; kind?: string };
  try { body = await request.json(); } catch {
    return new Response('', { status: 400 });
  }

  const { partner_slug, kind } = body;
  if (!partner_slug || !kind || !VALID_SLUGS.has(partner_slug) || !VALID_KINDS.includes(kind)) {
    return new Response('', { status: 400 });
  }

  try {
    db.insert(partnerClicks).values({
      partner_slug,
      kind,
      created_at: new Date(),
    }).run();
  } catch (err) {
    console.error('[track-partner] DB insert failed:', err);
  }

  return new Response(null, { status: 204 });
};
