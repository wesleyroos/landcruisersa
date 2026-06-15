import { politeFetch } from './http.ts';
import { normalizeModel, normalizeProvince } from './normalize.ts';
import { collectExtraSegments } from './registry.ts';
import type { DiscoveredRef, DiscoverStats, NormalizedListing, LivenessResult, SourceAdapter } from './types.ts';

// Penetration stats from the last discover(). AutoTrader's search HTML embeds its
// own "totalCount"/"totalPages" per model, so we read those: sourceTotal = sum of
// EVERY segment we crawl's totals (LC + the extra Toyota 4x4s when enabled), so the
// denominator matches `found` (which counts every crawled segment) — otherwise an
// LC-only denominator against an all-segments numerator reads >100%. capHit flags
// when any model's crawl came up short of its reported totalCount this run (a real,
// reliable "we didn't get them all" signal).
export const discoverStats: DiscoverStats = { sourceTotal: null, capHit: false };

const SOURCE = 'autotrader';
const BASE = 'https://www.autotrader.co.za';

// All Land Cruiser model slugs on AutoTrader SA
const LC_SEARCH_URLS = [
  `${BASE}/cars-for-sale/toyota/land-cruiser-79`,
  `${BASE}/cars-for-sale/toyota/land-cruiser-78`,
  `${BASE}/cars-for-sale/toyota/land-cruiser-76`,
  `${BASE}/cars-for-sale/toyota/land-cruiser-70`,
  `${BASE}/cars-for-sale/toyota/land-cruiser-80`,
  `${BASE}/cars-for-sale/toyota/land-cruiser-100`,
  `${BASE}/cars-for-sale/toyota/land-cruiser-105`,
  `${BASE}/cars-for-sale/toyota/land-cruiser-200`,
  `${BASE}/cars-for-sale/toyota/land-cruiser-300`,
  `${BASE}/cars-for-sale/toyota/land-cruiser`,
  `${BASE}/cars-for-sale/toyota/land-cruiser-prado`,
  `${BASE}/cars-for-sale/toyota/land-cruiser-fj`,
  `${BASE}/cars-for-sale/toyota/fj-cruiser`,
];
// Adjacent Toyota 4x4s — collected for data, not shown on the LC site
const EXTRA_SEARCH_URLS = [
  `${BASE}/cars-for-sale/toyota/hilux`,
  `${BASE}/cars-for-sale/toyota/fortuner`,
];
// Built per-run inside discover() so the Hilux/Fortuner toggle is read at
// runtime (after applyExtraSegments), not frozen at module load.
function searchUrls(): string[] {
  return collectExtraSegments() ? [...LC_SEARCH_URLS, ...EXTRA_SEARCH_URLS] : LC_SEARCH_URLS;
}

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// City → province mapping for major SA cities (best-effort)
const CITY_PROVINCE: Record<string, string> = {
  'johannesburg': 'Gauteng', 'sandton': 'Gauteng', 'midrand': 'Gauteng', 'centurion': 'Gauteng',
  'pretoria': 'Gauteng', 'tshwane': 'Gauteng', 'soweto': 'Gauteng', 'alberton': 'Gauteng',
  'boksburg': 'Gauteng', 'benoni': 'Gauteng', 'germiston': 'Gauteng', 'roodepoort': 'Gauteng',
  'fourways': 'Gauteng', 'randburg': 'Gauteng', 'krugersdorp': 'Gauteng',
  'cape town': 'Western Cape', 'stellenbosch': 'Western Cape', 'george': 'Western Cape',
  'paarl': 'Western Cape', 'bellville': 'Western Cape', 'brackenfell': 'Western Cape',
  'durban': 'KwaZulu-Natal', 'pinetown': 'KwaZulu-Natal', 'pietermaritzburg': 'KwaZulu-Natal',
  'port elizabeth': 'Eastern Cape', 'gqeberha': 'Eastern Cape', 'east london': 'Eastern Cape',
  'polokwane': 'Limpopo', 'nelspruit': 'Mpumalanga', 'mbombela': 'Mpumalanga',
  'rustenburg': 'North West', 'bloemfontein': 'Free State', 'kimberley': 'Northern Cape',
};

function cityToProvince(city: string): string {
  const key = city.toLowerCase().trim();
  return CITY_PROVINCE[key] ?? '';
}

// ─── SSR tile types ───────────────────────────────────────────────────────────

interface SummaryIcon {
  text: string;
  type: number;
}

interface AtTile {
  listingId: number;
  canonicalUrl: string;
  imageUrl?: string;
  standOutImageUrls?: string[];
  registrationYear?: number;
  price?: string;          // "R 1 299 900"
  make?: string;
  model?: string;
  variant?: string;
  newUsedDescription?: string;
  dealerName?: string;
  dealerCityName?: string;
  summaryIcons?: SummaryIcon[];
}

function parsePrice(raw: string): number {
  return Number(raw.replace(/[^0-9]/g, '')) || 0;
}

function parseMileageText(icons: SummaryIcon[]): number {
  for (const icon of icons) {
    // Look for "km" icon: "105 km", "15 000 km", "150 000 km"
    if (/km/i.test(icon.text)) {
      return Number(icon.text.replace(/[^0-9]/g, '')) || 0;
    }
  }
  return 0;
}

function parseTransmission(icons: SummaryIcon[]): 'manual' | 'automatic' {
  for (const icon of icons) {
    if (/auto/i.test(icon.text)) return 'automatic';
    if (/manual/i.test(icon.text)) return 'manual';
  }
  return 'manual';
}

function parseFuel(icons: SummaryIcon[]): string | undefined {
  const fuels = ['diesel', 'petrol', 'electric', 'hybrid', 'petrol/electric'];
  for (const icon of icons) {
    const lower = icon.text.toLowerCase();
    for (const f of fuels) {
      if (lower.includes(f)) return icon.text;
    }
  }
  return undefined;
}

function tileToListing(tile: AtTile): NormalizedListing {
  const title = [tile.registrationYear, tile.make, tile.model, tile.variant].filter(Boolean).join(' ');
  const photos: string[] = [];
  if (tile.imageUrl) photos.push(tile.imageUrl);
  for (const u of tile.standOutImageUrls ?? []) {
    if (!photos.includes(u)) photos.push(u);
  }
  const icons = tile.summaryIcons ?? [];
  const mileage = parseMileageText(icons);
  const isUsed = /used/i.test(tile.newUsedDescription ?? '') || mileage > 0;
  const url = tile.canonicalUrl.startsWith('http') ? tile.canonicalUrl : `${BASE}${tile.canonicalUrl}`;

  return {
    source: SOURCE,
    source_id: String(tile.listingId),
    source_url: url,
    title,
    year: tile.registrationYear ?? new Date().getFullYear(),
    model: normalizeModel(title, tile.registrationYear),
    price: parsePrice(tile.price ?? ''),
    mileage,
    province: normalizeProvince(cityToProvince(tile.dealerCityName ?? '')),
    new_or_used: isUsed ? 'Used' : 'New',
    transmission: parseTransmission(icons),
    colour: '',
    description: '',
    photos: photos.slice(0, 20),
    seller_name: tile.dealerName ?? 'AutoTrader Dealer',
    fuel_type: parseFuel(icons),
  };
}

// Populated during discover(); fetchListing reads from here (no per-listing HTTP calls)
const _cache = new Map<string, NormalizedListing>();

export const AutoTraderAdapter: SourceAdapter = {
  source: SOURCE,

  async discover(): Promise<DiscoveredRef[]> {
    _cache.clear();
    discoverStats.sourceTotal = null;
    discoverStats.capHit = false;
    const refs: DiscoveredRef[] = [];
    const seen = new Set<string>();
    // No per-model page cap: each model's crawl is driven by AutoTrader's own
    // "totalPages". SAFETY_CAP is only a runaway guard (a model would need ~6,000+
    // listings to reach it). Reliability comes from the per-model completeness check.
    const SAFETY_CAP = 250;

    let srcTotal = 0;
    let gotTotal = false;
    let anyIncomplete = false;

    const SEARCH_URLS = searchUrls();

    // Streamed to the admin "Run Ingest" progress bar via stdout (run-ingest.ts
    // parses PROGRESS:: lines). `done` is fractional so the bar moves per page.
    const progress = (done: number, sub: string) =>
      console.log(`PROGRESS::${JSON.stringify({ phase: 'discover', done, total: SEARCH_URLS.length, sub })}`);

    for (let mi = 0; mi < SEARCH_URLS.length; mi++) {
      const baseUrl = SEARCH_URLS[mi];
      const slug = baseUrl.split('/').pop()!;
      let totalPages = 1;                 // refined from page 1's embedded count
      let totalCount = 0;
      const modelIds = new Set<string>(); // distinct listings this model's pages showed
      let aborted = false;                // a page failed mid-crawl → coverage incomplete

      for (let page = 1; page <= Math.min(totalPages, SAFETY_CAP); page++) {
        // AutoTrader paginates via ?pagenumber=N (NOT ?p=N — that param is ignored
        // and silently re-serves page 1, which once truncated us to ~6% of stock).
        const pageUrl = page === 1 ? baseUrl : `${baseUrl}?pagenumber=${page}`;
        let res: Response;
        try {
          res = await politeFetch(pageUrl, {
            headers: {
              'Accept': 'text/html,application/xhtml+xml',
              'User-Agent': BROWSER_UA,
              'Accept-Language': 'en-ZA,en;q=0.9',
            },
          }, 2, { min: 2500, max: 6000 }); // AT-only: 2.5–6 s/request to stay under rate limits
        } catch (e) {
          aborted = true; // politeFetch already retried — a throw means it's really down
          console.warn(`[autotrader] ${slug} page ${page} failed after retries (${e}) — coverage incomplete`);
          break;
        }
        if (!res.ok) {
          aborted = true; // do NOT silently break-as-done; this is a truncation
          console.warn(`[autotrader] ${slug} page ${page} → HTTP ${res.status} — coverage incomplete`);
          break;
        }

        const html = await res.text();

        if (page === 1) {
          const tp = html.match(/"totalPages":(\d+)/);
          const tc = html.match(/"totalCount":(\d+)/);
          if (tp) totalPages = Number(tp[1]);
          if (tc) totalCount = Number(tc[1]);
          if (totalCount) { srcTotal += totalCount; gotTotal = true; }
          if (totalPages > SAFETY_CAP) {
            aborted = true;
            console.warn(`[autotrader] ${slug} has ${totalPages} pages > ${SAFETY_CAP} safety cap — raise SAFETY_CAP`);
          }
        }

        let foundOnPage = 0;

        const scriptRe = /<script[^>]*>([\s\S]*?)<\/script>/gi;
        let scriptMatch: RegExpExecArray | null;
        while ((scriptMatch = scriptRe.exec(html)) !== null) {
          const s = scriptMatch[1];
          if (!s.includes('canonicalUrl') || !s.includes('listingId')) continue;

          const tileMatches = s.matchAll(/"listingId":(\d+),"canonicalUrl":"([^"]+)"/g);
          for (const m of tileMatches) {
            const id = m[1];
            modelIds.add(id);           // per-model completeness, counted before global dedup
            if (seen.has(id)) continue; // global dedup → unique refs across models
            seen.add(id);

            const startIdx = s.lastIndexOf('{"resultType":', s.indexOf(`"listingId":${id}`));
            if (startIdx === -1) continue;

            let depth = 0, endIdx = startIdx;
            for (let i = startIdx; i < s.length; i++) {
              if (s[i] === '{') depth++;
              else if (s[i] === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
            }
            if (endIdx === startIdx) continue;

            try {
              const tile = JSON.parse(s.slice(startIdx, endIdx + 1)) as AtTile;
              const listing = tileToListing(tile);
              _cache.set(id, listing);
              const url = tile.canonicalUrl.startsWith('http') ? tile.canonicalUrl : `${BASE}${tile.canonicalUrl}`;
              refs.push({ source: SOURCE, source_id: id, source_url: url });
              foundOnPage++;
            } catch { /* malformed tile — skip */ }
          }
          break; // only one script tag has the tile data
        }

        console.log(`[autotrader] ${slug} page ${page}/${totalPages}: ${foundOnPage} new (${modelIds.size}/${totalCount || '?'})`);
        progress(mi + page / Math.max(totalPages, 1), `${slug} ${page}/${totalPages}`);
        if (foundOnPage === 0) break; // ran out of new listings — done with this model
      }

      // Reliable completeness signal: did we capture (nearly) all of this model's
      // listings? 10% slack absorbs cross-model dedup and listings that churn between
      // the reported count and the crawl. This replaces the old page-cap heuristic.
      if (totalCount > 0 && (aborted || modelIds.size < totalCount * 0.9)) {
        anyIncomplete = true;
        console.warn(`[autotrader] ${slug} INCOMPLETE: captured ${modelIds.size}/${totalCount}${aborted ? ' (crawl aborted)' : ''}`);
      }

      // Breather between model segments — never hammer AutoTrader as one unbroken
      // stream of ~300 pages (the burst pattern that tripped its rate limiter).
      if (mi < SEARCH_URLS.length - 1) {
        await new Promise(r => setTimeout(r, 15_000 + Math.random() * 15_000)); // 15–30 s
      }
    }

    discoverStats.sourceTotal = gotTotal ? srcTotal : null;
    discoverStats.capHit = anyIncomplete; // now means: a model's crawl came up short this run
    return refs;
  },

  async fetchListing(ref: DiscoveredRef): Promise<NormalizedListing | null> {
    // Return from SSR cache — avoids per-listing HTTP requests entirely
    return _cache.get(ref.source_id) ?? null;
  },

  async isStillLive(ref: DiscoveredRef): Promise<LivenessResult> {
    const res = await politeFetch(ref.source_url, {
      method: 'HEAD',
      headers: { 'User-Agent': BROWSER_UA },
    });
    if (res.status === 404) return 'removed';
    if (res.ok) return 'live';
    return 'unknown';
  },
};
