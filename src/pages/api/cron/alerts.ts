export const prerender = false;
import type { APIRoute } from 'astro';
import { runAlertSweep } from '@/lib/alerts';

// Daily saved-vehicle alert sweep. Primary trigger is the server-side scheduler
// (src/lib/alerts-scheduler.ts, ~08:00 SAST); this authed route is the GitHub
// cron backup. The per-day guard in runAlertSweep() makes both safe to call.
// ?dryRun=1 detects + reports without sending; ?force=1 bypasses the day guard.
export const POST: APIRoute = async ({ request }) => {
  const auth = request.headers.get('authorization') ?? '';
  const token = import.meta.env.INGEST_TOKEN ?? process.env.INGEST_TOKEN;
  if (!token || auth !== `Bearer ${token}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dryRun') === '1';
  const force = url.searchParams.get('force') === '1';

  const result = await runAlertSweep({ dryRun, force });
  return new Response(JSON.stringify({ ok: true, ...result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
