export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { ingestRuns } from '@/db/schema';
import { inArray, desc } from 'drizzle-orm';

// "Last run" comes from the durable ingest_runs table — written by reportRun()
// on EVERY scheduled and manual run, on whichever machine did the work (the
// scheduled ingests run on the local Mac and report to prod). The old version
// read /tmp file mtimes, which were server-local and ephemeral: Fly wipes /tmp on
// every deploy/machine restart, and the Mac cron never wrote them — so "Last run"
// was usually blank (and desc-backfill always blank, since nothing wrote its file).
function lastRunFor(sources: string[]): number | null {
  const row = db
    .select({ run_at: ingestRuns.run_at })
    .from(ingestRuns)
    .where(inArray(ingestRuns.source, sources))
    .orderBy(desc(ingestRuns.run_at))
    .limit(1)
    .get();
  return row?.run_at ? row.run_at.getTime() : null;
}

// The report `source` values, grouped to the three admin cards.
const INGEST_SOURCES   = ['autotrader', 'wbc', 'adios', 'wbb', 'carsza'];
const IMAGE_BACKFILL   = ['at-images', 'at-image-rehost'];
const DESC_BACKFILL    = ['at-desc-backfill'];

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
    ingest:      { lastRun: lastRunFor(INGEST_SOURCES), nextRun: next4Hour() },
    backfill:    { lastRun: lastRunFor(IMAGE_BACKFILL), nextRun: nextHour() },
    descBackfill:{ lastRun: lastRunFor(DESC_BACKFILL),  nextRun: next4Hour() },
  }), { headers: { 'Content-Type': 'application/json' } });
};
