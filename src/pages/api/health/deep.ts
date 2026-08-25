// Deep health check: app + OUR database, nothing else. One trivially cheap
// query through the normal client, because that's what a homepage check can't
// see — the app happily serving HTML while every DB call fails.
//
// ⛔ Scope rule (GD standard): third-party services (Anthropic, R2, Paystack,
// Meta, Plausible…) do NOT belong here. This endpoint feeds the reported SLA,
// and we're not liable for upstream providers. Those go on /api/health/deps.
// ⛔ Never point Fly's own health check at this route — see src/pages/api/health.ts.
//
// Runs every 5 minutes forever via UptimeRobot keyword monitor (keyword
// `"db":"ok"`, alert when NOT present). Full spec:
// GD-Vault/Playbooks/Health Endpoint Standard.md
export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { sql } from 'drizzle-orm';

export const GET: APIRoute = () => {
  const checks: Record<string, 'ok' | 'fail'> = {};
  try {
    db.run(sql`SELECT 1`);
    checks.db = 'ok';
  } catch {
    checks.db = 'fail';
  }

  const allOk = Object.values(checks).every(v => v === 'ok');
  return new Response(JSON.stringify({ status: allOk ? 'ok' : 'degraded', checks }), {
    status: allOk ? 200 : 503,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};
