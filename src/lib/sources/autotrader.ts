import { politeFetch } from './http.ts';
import { normalizeModel, normalizeProvince } from './normalize.ts';
import { collectExtraSegments } from './registry.ts';
import type { DiscoveredRef, DiscoverStats, NormalizedListing, LivenessResult, SourceAdapter } from './types.ts';

// Penetration stats from the last discover(). AutoTrader's search HTML embeds its
// own "totalCount"/"totalPages" per model, so we read those: sourceTotal = sum of
// the LC models' totals (a true penetration denominator), and capHit flags only
// when an LC model has more pages than PAGE_CAP (genuine truncation of public stock).
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
const SEARCH_URLS = collectExtraSegments() ? [...LC_SEARCH_URLS, ...EXTRA_SEARCH_URLS] : LC_SEARCH_URLS;

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
    // Per-URL page ceiling. LC models max ~21 pages so they're fully covered;
    // Hilux/Fortuner run to 100+ pages and are intentionally sampled to this depth
    // (~PAGE_CAP×30 listings) — enough for benchmarking, without a huge crawl.
    const PAGE_CAP = 30;
    const LC_URLS = new Set(LC_SEARCH_URLS);

    let lcTotal = 0;
    let gotLcTotal = false;

    for (const baseUrl of SEARCH_URLS) {
      const isLcUrl = LC_URLS.has(baseUrl);
      let totalPages = PAGE_CAP; // refined from page 1's embedded count

      for (let page = 1; page <= Math.min(totalPages, PAGE_CAP); page++) {
        // AutoTrader paginates via ?pagenumber=N (NOT ?p=N — that param is ignored
        // and silently re-serves page 1, which truncated us to ~6% of stock).
        const pageUrl = page === 1 ? baseUrl : `${baseUrl}?pagenumber=${page}`;
        const res = await politeFetch(pageUrl, {
          headers: {
            'Accept': 'text/html,application/xhtml+xml',
            'User-Agent': BROWSER_UA,
            'Accept-Language': 'en-ZA,en;q=0.9',
          },
        });
        if (!res.ok) break;

        const html = await res.text();

        if (page === 1) {
          const tp = html.match(/"totalPages":(\d+)/);
          const tc = html.match(/"totalCount":(\d+)/);
          if (tp) totalPages = Number(tp[1]);
          if (isLcUrl && tc) { lcTotal += Number(tc[1]); gotLcTotal = true; }
          // Genuine truncation alarm — only for LC models (the public market we
          // claim to fully cover). Sampled Hilux/Fortuner exceeding the cap is by design.
          if (isLcUrl && totalPages > PAGE_CAP) {
            discoverStats.capHit = true;
            console.warn(`[autotrader] ${baseUrl.split('/').pop()} has ${totalPages} pages > ${PAGE_CAP}-page cap — raise PAGE_CAP`);
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
            if (seen.has(id)) continue;
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

        console.log(`[autotrader] ${baseUrl.split('/').pop()} page ${page}/${Math.min(totalPages, PAGE_CAP)}: ${foundOnPage} listings`);
        if (foundOnPage === 0) break; // empty page → done with this model
        if (page < 15) await new Promise(r => setTimeout(r, 1500));
      }
    }

    discoverStats.sourceTotal = gotLcTotal ? lcTotal : null;
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
