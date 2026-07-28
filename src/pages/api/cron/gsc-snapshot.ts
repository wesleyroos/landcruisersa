export const prerender = false;

import type { APIRoute } from 'astro';
import { snapshotGscDaily } from '@/lib/gsc-snapshot';

// Daily GSC snapshot — BACKUP to the Fly server-side scheduler
// (src/lib/post-suggestion-scheduler.ts), which snapshots at 07:00 SAST. This
// GitHub-cron route catches the rare day the server was mid-deploy at that hour.
// The writer upserts a trailing finalised window, so a late/duplicate run just
// re-writes the same rows — safe to run alongside the server scheduler.
export const POST: APIRoute = async ({ request }) => {
  const auth = request.headers.get('authorization') ?? '';
  const token = import.meta.env.INGEST_TOKEN ?? process.env.INGEST_TOKEN;
  if (!token || auth !== `Bearer ${token}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const result = await snapshotGscDaily();
  const status = result.ok ? 200 : result.reason === 'unconfigured' ? 200 : 502;
  return new Response(JSON.stringify(result), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
};
