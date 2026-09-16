import { targets } from './targets.ts';

// Report an ingest run summary to the app — powers the admin Scrapers page.
// Never throws: health reporting must not break an ingest.
export interface RunStats {
  found?: number;
  created?: number;
  updated?: number;
  skipped?: number;
  removed?: number;
  ok?: boolean;
  note?: string;
  sourceTotal?: number | null; // total the source itself reported (powers penetration %)
  capHit?: boolean;            // hit a pagination ceiling this run
}

// Reported to EVERY configured target (LCSA + BakkiesSA) so each site's
// /admin/scrapers shows the run — one crawl, two receiving sides.
export async function reportRun(source: string, stats: RunStats): Promise<void> {
  for (const t of targets()) {
    if (!t.token) continue;
    try {
      await fetch(`${t.siteUrl}/api/ingest-run`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, ...stats }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      console.error(`[${source}] failed to report run stats to ${t.name}:`, err);
    }
  }
}
