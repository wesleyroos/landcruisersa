export const prerender = false;

import type { APIRoute } from 'astro';
import { isAdminSession } from '@/lib/track-guard';
import { db } from '@/db/index';
import { outboundClicks } from '@/db/schema';

// First-party tracking of outbound clicks from guide pages — which external
// destinations readers click, and from which article. Our own content/demand
// signal and the instrumentation any future *trackable* referral would need.
// NOT lead-gen attribution and no UTM is added to the outbound link itself.
const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|fetch|monitor|headless/i;
const OWN_HOST = /(^|\.)landcruisersa\.co\.za$/i;

export const POST: APIRoute = async ({ request, cookies }) => {
  if (isAdminSession(cookies)) return new Response(null, { status: 204 }); // skip our own clicks
  const ua = request.headers.get('user-agent') ?? '';
  if (BOT_UA.test(ua)) return new Response(null, { status: 204 });

  let body: { path?: string; url?: string };
  try { body = await request.json(); } catch {
    return new Response('', { status: 400 });
  }

  const { path, url } = body;
  if (!url || typeof url !== 'string') return new Response('', { status: 400 });

  // Derive + validate the destination host server-side; ignore internal links.
  let host: string;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return new Response('', { status: 400 });
    host = u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return new Response('', { status: 400 });
  }
  if (OWN_HOST.test(host)) return new Response(null, { status: 204 });

  const article_path = (typeof path === 'string' ? path : '').slice(0, 256);

  try {
    db.insert(outboundClicks).values({
      article_path,
      dest_host: host.slice(0, 128),
      dest_url: url.slice(0, 512),
      created_at: new Date(),
    }).run();
  } catch (err) {
    console.error('[track-outbound] DB insert failed:', err);
  }

  return new Response(null, { status: 204 });
};
