export const prerender = false;

import type { APIRoute } from 'astro';
import { requireAdmin, unauthorized } from '@/lib/admin-auth';
import { syncIgInsights } from '@/lib/ig-insights';

// Manual trigger for the IG insights sync (the daily scheduler is the primary;
// this exists for on-demand refreshes and first-run backfill verification).
export const POST: APIRoute = async ({ cookies }) => {
  if (!requireAdmin(cookies)) return unauthorized();

  try {
    const result = await syncIgInsights();
    if (!result) {
      return new Response(JSON.stringify({ error: 'Instagram not connected' }), { status: 401 });
    }
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'sync failed' }), { status: 500 });
  }
};
