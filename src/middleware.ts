import { defineMiddleware } from 'astro:middleware';
import { ensurePostSuggestionScheduler } from './lib/post-suggestion-scheduler';
import { ensureAlertsScheduler } from './lib/alerts-scheduler';
import { rateLimited, clientIp } from './lib/rate-limit';

// Per-IP throttle for the heavy SSR listing pages. Each /listings render is
// expensive, and the single 256MB/1-vCPU machine saturates when a crawler
// walks every listing page back-to-back — that caused the ~38-min "down"
// incident in the early hours of 2026-06-26 (UptimeRobot timed out while the
// box swap-thrashed). Humans and well-behaved search/LLM crawlers stay well
// under this ceiling; a hammering scraper gets 429'd *before* we pay for the
// render. Scoped to /listings only so it never touches the homepage that the
// uptime monitors poll. Tune the two constants if it's too tight/loose.
const LISTINGS_MAX = 50; // requests…
const LISTINGS_WINDOW_MS = 30_000; // …per 30s per IP (~1.6 req/s sustained)

export const onRequest = defineMiddleware(async ({ url, cookies, redirect, request }, next) => {
  // Idempotent — starts the daily IG-email + saved-vehicle-alert timers on the
  // first request after boot.
  ensurePostSuggestionScheduler();
  ensureAlertsScheduler();

  const path = url.pathname;
  const isAdminArea = path.startsWith('/admin');
  const isLoginPage = path === '/admin/login' || path === '/admin/login/';
  const isLoginApi = path === '/api/admin/login';

  if (isAdminArea && !isLoginPage && !isLoginApi) {
    const token = cookies.get('lcsa_admin')?.value;
    const secret = import.meta.env.ADMIN_SECRET ?? process.env.ADMIN_SECRET;

    if (!token || !secret || token !== secret) {
      return redirect('/admin/login');
    }
  }

  // Shed aggressive crawlers off the heavy listing pages before they render.
  if (path.startsWith('/listings')) {
    const ip = clientIp(request);
    if (rateLimited(`listings:${ip}`, LISTINGS_MAX, LISTINGS_WINDOW_MS)) {
      console.log(`[throttle] 429 ${ip} ${path}`);
      return new Response('Too many requests — please slow down.', {
        status: 429,
        headers: { 'Retry-After': '15', 'Cache-Control': 'no-store' },
      });
    }
  }

  // Request timing — log slow renders and all admin page loads so
  // slowness reports can be split into server-side vs network/client.
  const start = Date.now();
  const response = await next();
  const ms = Date.now() - start;
  if (ms > 1000 || isAdminArea) {
    console.log(`[timing] ${request.method} ${path} -> ${response.status} in ${ms}ms`);
  }
  return response;
});
