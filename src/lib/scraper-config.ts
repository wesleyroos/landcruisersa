import { db } from '@/db/index';
import { siteConfig } from '@/db/schema';
import { like } from 'drizzle-orm';

// The scrapers that can be toggled. autotrader + carsza run on the residential
// local cron; wbc/adios/wbb/vcsa run on GitHub Actions. The toggle gates the
// local cron (see scripts/local-ingest-cron.sh); manual "Run" from the admin
// always bypasses it.
export const SCRAPER_SOURCES = ['autotrader', 'wbc', 'carsza', 'adios', 'wbb', 'vcsa'] as const;
export type ScraperSource = (typeof SCRAPER_SOURCES)[number];

// Sources that carry an adjacent Toyota-4x4 (Hilux/Fortuner) segment we can
// optionally collect for market data. Adios is a Land Cruiser specialist and
// has no Hilux/Fortuner stock, so it gets no extra-segments toggle. Nor does
// VCSA: it's a classic dealer, and a restored '70s Hilux is a collector's item
// priced nothing like the modern GD-6 cohort the toggle exists to benchmark.
export const EXTRA_SEGMENT_SOURCES = ['autotrader', 'wbc', 'carsza', 'wbb'] as const;

const keyFor = (s: string) => `scraper_scheduled_${s}`;
const extraKeyFor = (s: string) => `scraper_extra_${s}`;

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

// Per-source "also collect Hilux/Fortuner" flag, stored in site_config. Value '1'
// = collect, absent or '0' = off. Default OFF: Hilux/Fortuner are not scraped
// unless explicitly enabled here. Read by ingest scripts via /api/scraper-config?extra=1.
export function getExtraMap(): Record<string, boolean> {
  const rows = db.select().from(siteConfig).where(like(siteConfig.key, 'scraper_extra_%')).all();
  const on = new Set(rows.filter(r => r.value === '1').map(r => r.key));
  const map: Record<string, boolean> = {};
  for (const s of EXTRA_SEGMENT_SOURCES) map[s] = on.has(extraKeyFor(s));
  return map;
}

export function setSourceExtra(source: string, on: boolean) {
  const value = on ? '1' : '0';
  db.insert(siteConfig)
    .values({ key: extraKeyFor(source), value, updated_at: new Date() })
    .onConflictDoUpdate({ target: siteConfig.key, set: { value, updated_at: new Date() } })
    .run();
}
