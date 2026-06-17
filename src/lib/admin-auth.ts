import type { AstroCookies } from 'astro';
import { isAdminSession } from './track-guard';

// Single source of truth for "is this request an authenticated admin?".
// Server-side endpoints under /api/admin/* (and the listing mutators) must call
// this themselves — the route middleware only guards /admin/* *pages*, not the
// /api/* surface, so each privileged endpoint is responsible for its own gate.
export function requireAdmin(cookies: AstroCookies): boolean {
  return isAdminSession(cookies);
}

export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
