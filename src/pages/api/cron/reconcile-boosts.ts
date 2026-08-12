export const prerender = false;
import type { APIRoute } from 'astro';
import { reconcileBoosts } from '@/lib/boost-reconcile';

// Manual/backup trigger for the boost payment sweep. The primary trigger is the
// in-process scheduler (src/lib/boost-scheduler.ts, every 5 min) — this authed
// route exists so a payment can be chased on demand, e.g. a seller says they
// paid but nothing shows. ?hours=48 widens the look-back for that case.
export const POST: APIRoute = async ({ request }) => {
  const auth = request.headers.get('authorization') ?? '';
  const token = import.meta.env.INGEST_TOKEN ?? process.env.INGEST_TOKEN;
  if (!token || auth !== `Bearer ${token}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const hours = Number(new URL(request.url).searchParams.get('hours'));
  const result = await reconcileBoosts(
    Number.isFinite(hours) && hours > 0 ? { windowHours: Math.min(hours, 24 * 30) } : {},
  );

  return new Response(JSON.stringify({ ok: true, ...result }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};
