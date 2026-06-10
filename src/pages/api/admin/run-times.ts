export const prerender = false;

import type { APIRoute } from 'astro';
import { statSync } from 'fs';

function mtime(path: string): number | null {
  try { return statSync(path).mtimeMs; } catch { return null; }
}

// Next 4-hour boundary (00:00, 04:00, 08:00, 12:00, 16:00, 20:00)
function next4Hour(): number {
  const now = new Date();
  const next = new Date(now);
  const nextHour = Math.ceil(now.getHours() / 4) * 4;
  next.setHours(nextHour, 0, 0, 0);
  if (next <= now) next.setHours(next.getHours() + 4);
  return next.getTime();
}

// Next hour boundary from now
function nextHour(): number {
  const now = new Date();
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return next.getTime();
}

export const GET: APIRoute = () => {
  return new Response(JSON.stringify({
    ingest:      { lastRun: mtime('/tmp/lcsa-poll.log'),                nextRun: next4Hour() },
    backfill:    { lastRun: mtime('/tmp/lcsa-backfill-at-images.log'),  nextRun: nextHour() },
    descBackfill:{ lastRun: mtime('/tmp/lcsa-desc-backfill.log'),       nextRun: next4Hour() },
  }), { headers: { 'Content-Type': 'application/json' } });
};
