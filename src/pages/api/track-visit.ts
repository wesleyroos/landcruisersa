export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { visitEvents } from '@/db/schema';

const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|fetch|monitor|headless/i;

export const POST: APIRoute = async ({ request }) => {
  const ua = request.headers.get('user-agent') ?? '';
  if (BOT_UA.test(ua)) return new Response(null, { status: 204 });

  let body: { utm_source?: string; landing_path?: string };
  try { body = await request.json(); } catch {
    return new Response('', { status: 400 });
  }

  const { utm_source, landing_path } = body;
  if (!utm_source || typeof utm_source !== 'string') {
    return new Response('', { status: 400 });
  }

  try {
    db.insert(visitEvents).values({
      utm_source: utm_source.toLowerCase().slice(0, 32),
      landing_path: landing_path ? String(landing_path).slice(0, 256) : null,
      created_at: new Date(),
    }).run();
  } catch (err) {
    console.error('[track-visit] DB insert failed:', err);
  }

  return new Response(null, { status: 204 });
};
