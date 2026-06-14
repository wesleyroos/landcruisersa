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

export async function reportRun(source: string, stats: RunStats): Promise<void> {
  const SITE_URL = process.env.SITE_URL ?? 'https://landcruisersa.fly.dev';
  const TOKEN = process.env.INGEST_TOKEN ?? '';
  if (!TOKEN) return;
  try {
    await fetch(`${SITE_URL}/api/ingest-run`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, ...stats }),
    });
  } catch (err) {
    console.error(`[${source}] failed to report run stats:`, err);
  }
}
