// Shallow liveness check: "is the process up?" — no database round-trip, so it
// stays honest even when SQLite is unhappy, and it's safe for infrastructure
// (a load balancer / Fly http check) to watch. Anything that can restart the
// machine must point HERE, never at /api/health/deep — a transient DB blip
// returning 503 would otherwise get the machine replaced mid-hiccup.
// GD standard: GD-Vault/Playbooks/Health Endpoint Standard.md
export const prerender = false;

import type { APIRoute } from 'astro';

export const GET: APIRoute = () =>
  new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
