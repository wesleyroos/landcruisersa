import type { NormalizedListing } from './types.ts';
import { segmentForModel } from './normalize.ts';

// Multi-site fan-out: ONE crawl, rows stored on every site that owns the row's
// segment. This is how the engine network shares the scraper without sharing
// the assets (each site keeps its own DB / R2 / domain):
//
//   primary (SITE_URL / INGEST_TOKEN)         land-cruiser · other-4x4 · toyota-4x4
//   BakkiesSA (BAKKIES_SITE_URL / _TOKEN)     bakkie · toyota-4x4   ← Hilux/Fortuner on BOTH
//   Jimny pass (SCRAPE_SEGMENT=jimny)         jimny only, primary = jimnysa (no fan-out)
//
// Hilux/Fortuner deliberately land on both sites: LCSA keeps them for P28 and
// BakkiesSA shows them from day one. Bakkies go to BakkiesSA only.
//
// A target that isn't configured (no BAKKIES_* env) simply doesn't exist — the
// LC run behaves exactly as before. A secondary target being down never fails
// a listing for the primary: its result is logged and counted, not fatal.

export interface Target {
  name: string;
  siteUrl: string;
  token: string;
  segments: ReadonlySet<string>;
}

let _targets: Target[] | null = null;

export function targets(): Target[] {
  if (_targets) return _targets;
  const isJimny = process.env.SCRAPE_SEGMENT === 'jimny';
  const list: Target[] = [{
    name: isJimny ? 'jimnysa' : 'lcsa',
    siteUrl: process.env.SITE_URL ?? 'https://landcruisersa.fly.dev',
    token: process.env.INGEST_TOKEN ?? '',
    segments: new Set(isJimny ? ['jimny'] : ['land-cruiser', 'other-4x4', 'toyota-4x4']),
  }];
  const bUrl = process.env.BAKKIES_SITE_URL, bTok = process.env.BAKKIES_INGEST_TOKEN;
  if (!isJimny && bUrl && bTok) {
    list.push({ name: 'bakkiessa', siteUrl: bUrl.replace(/\/$/, ''), token: bTok, segments: new Set(['bakkie', 'toyota-4x4']) });
  }
  _targets = list;
  return list;
}

export const primary = (): Target => targets()[0];

export function targetsFor(segment: string): Target[] {
  return targets().filter(t => t.segments.has(segment));
}

/** Every segment some configured target owns — the union the crawl is worth collecting. */
export function ownedSegments(): Set<string> {
  return new Set(targets().flatMap(t => [...t.segments]));
}

export interface PostResult {
  ok: boolean;             // the deciding target accepted the row
  status: number;          // HTTP status from the deciding target (0 = network error)
  action?: string;         // 'created' | 'updated' | 'skipped_duplicate' | …
  networkError?: boolean;  // deciding target unreachable — feeds the caller's abort logic
  target: string;          // which target decided
}

/**
 * POST a listing to every target that owns its segment. The FIRST owning
 * target (LCSA when it owns the segment, else BakkiesSA) is the "deciding"
 * target whose result drives the caller's created/updated/abort counters;
 * further targets are best-effort and only logged.
 */
export async function postListing(listing: NormalizedListing, timeoutMs = 30_000): Promise<PostResult> {
  const seg = listing.segment ?? segmentForModel(listing.model);
  const owners = targetsFor(seg);
  if (owners.length === 0) return { ok: false, status: 0, action: 'no_target', target: 'none' };

  let decided: PostResult | null = null;
  for (const t of owners) {
    let r: PostResult;
    try {
      const res = await fetch(`${t.siteUrl}/api/ingest`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(listing),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const j = res.ok ? await res.json().catch(() => ({})) as { action?: string } : {};
      r = { ok: res.ok, status: res.status, action: j.action, target: t.name };
    } catch (err) {
      r = { ok: false, status: 0, networkError: true, target: t.name };
      if (decided) console.warn(`[fanout] ${t.name} unreachable for ${listing.source}/${listing.source_id}: ${String(err).slice(0, 80)}`);
    }
    if (!decided) decided = r;
    else if (!r.ok && !r.networkError) console.warn(`[fanout] ${t.name} rejected ${listing.source}/${listing.source_id}: ${r.status}`);
  }
  return decided!;
}
