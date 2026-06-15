export const prerender = false;

import type { APIRoute } from 'astro';
import { getScheduledMap } from '@/lib/scraper-config';

// Bearer INGEST_TOKEN — the caller is the local cron (server-to-server), not a
// browser. Same auth as /api/ingest.
function checkToken(request: Request): boolean {
  const auth = request.headers.get('authorization') ?? '';
  const token = import.meta.env.INGEST_TOKEN ?? process.env.INGEST_TOKEN;
  if (!token) return false;
  return auth === `Bearer ${token}`;
}

export const GET: APIRoute = async ({ request }) => {
  if (!checkToken(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  return new Response(JSON.stringify(getScheduledMap()), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
