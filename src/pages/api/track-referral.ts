export const prerender = false;

import type { APIRoute } from 'astro';
import { isAdminSession } from '@/lib/track-guard';
import { classifyAiReferrer } from '@/lib/ai-referrers';
import { db } from '@/db/index';
import { aiReferrals } from '@/db/schema';

const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|fetch|monitor|headless/i;

// First-party LLM-citation logger. The client beacon (Base.astro) fires this
// when document.referrer is an AI-assistant host; we re-classify server-side
// (never trust the client) and log the host + landing page. Non-AI referrers
// and own clicks are silently dropped (204) so the beacon stays fire-and-forget.
export const POST: APIRoute = async ({ request, cookies }) => {
  if (isAdminSession(cookies)) return new Response(null, { status: 204 });
  const ua = request.headers.get('user-agent') ?? '';
  if (BOT_UA.test(ua)) return new Response(null, { status: 204 });

  let body: { referrer?: string; landing_path?: string; client_id?: string };
  try { body = await request.json(); } catch {
    return new Response('', { status: 400 });
  }

  const ai = classifyAiReferrer(body.referrer);
  if (!ai) return new Response(null, { status: 204 }); // not an AI referral — ignore

  try {
    db.insert(aiReferrals).values({
      referrer_host: ai.host.slice(0, 128),
      source: ai.source,
      landing_path: body.landing_path ? String(body.landing_path).slice(0, 256) : null,
      client_id: body.client_id ? String(body.client_id).slice(0, 64) : null,
      created_at: new Date(),
    }).run();
  } catch (err) {
    console.error('[track-referral] DB insert failed:', err);
  }

  return new Response(null, { status: 204 });
};
