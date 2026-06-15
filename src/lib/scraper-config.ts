import { db } from '@/db/index';
import { siteConfig } from '@/db/schema';
import { like } from 'drizzle-orm';

// The scrapers that can be toggled. autotrader + carsza run on the residential
// local cron; wbc/adios/wbb run on GitHub Actions. The toggle gates the local
// cron (see scripts/local-ingest-cron.sh); manual "Run" from the admin always
// bypasses it.
export const SCRAPER_SOURCES = ['autotrader', 'wbc', 'carsza', 'adios', 'wbb'] as const;
export type ScraperSource = (typeof SCRAPER_SOURCES)[number];

const keyFor = (s: string) => `scraper_scheduled_${s}`;

// Per-source "run on schedule" flag, stored in site_config. Value '0' = paused,
// absent or '1' = scheduled (default on). Soft, admin-toggleable — separate from
// the hard env kill switch DISABLE_SOURCE_<X> in registry.ts.
export function getScheduledMap(): Record<string, boolean> {
  const rows = db.select().from(siteConfig).where(like(siteConfig.key, 'scraper_scheduled_%')).all();
  const paused = new Set(rows.filter(r => r.value === '0').map(r => r.key));
  const map: Record<string, boolean> = {};
  for (const s of SCRAPER_SOURCES) map[s] = !paused.has(keyFor(s));
  return map;
}

export function setSourceScheduled(source: string, on: boolean) {
  const value = on ? '1' : '0';
  db.insert(siteConfig)
    .values({ key: keyFor(source), value, updated_at: new Date() })
    .onConflictDoUpdate({ target: siteConfig.key, set: { value, updated_at: new Date() } })
    .run();
}
