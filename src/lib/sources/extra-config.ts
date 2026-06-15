import { setCollectExtraSegments } from './registry.ts';

// Fetches the per-source "also collect Hilux/Fortuner" toggle from the live site
// (set from /admin/scrapers) and applies it for this ingest run. Standalone
// ingest scripts can't read the DB directly — the SQLite volume lives on Fly —
// so the flag travels over the same /api/scraper-config endpoint the cron uses.
//
// Fail-CLOSED: any error → extra segments OFF (Land Cruiser only). This matches
// the default that Hilux/Fortuner are not scraped unless explicitly enabled, and
// means a config-fetch hiccup can never silently resume scraping them.
export async function applyExtraSegments(source: string): Promise<boolean> {
  const siteUrl = process.env.SITE_URL ?? 'https://landcruisersa.co.za';
  const token = process.env.INGEST_TOKEN ?? '';
  let on = false;
  try {
    const res = await fetch(`${siteUrl}/api/scraper-config?extra=1`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const map = (await res.json()) as Record<string, boolean>;
      on = map[source] === true;
    }
  } catch {
    /* fail closed — leave `on` false */
  }
  setCollectExtraSegments(on);
  console.log(`[${source}] Hilux/Fortuner collection: ${on ? 'ON' : 'off'}`);
  return on;
}
