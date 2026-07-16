import { normalizeModel } from './normalize.ts';
import type { DiscoveredRef, DiscoverStats, NormalizedListing, LivenessResult, SourceAdapter } from './types.ts';

// Vintage Cars SA (vintagecarssa.co.za) — a classic-car dealer in Shere,
// Pretoria East. Their stock reaches AutoTrader/cars.co.za eventually (and gets
// scraped there), but the direct pull is better: it's the seller's own copy, the
// full gallery, and it lands the day they list rather than weeks later.
//
// The site is WordPress and the cars are a `buying-cars` custom post type whose
// REST route exposes every field we need as structured meta — no HTML parsing,
// no anti-bot. This is the whole reason this adapter is 200 lines and not 400.

// Penetration stats from the last discover(). X-WP-Total counts the WHOLE
// classic catalogue (364 cars on 2026-07-15) of which ~4 are Land Cruisers, so
// reporting it as sourceTotal would render a 1% "penetration" on the admin
// Scrapers page and read as a broken crawl when it just means VCSA mostly
// stocks Porsches. No LC-specific total is exposed → null.
export const discoverStats: DiscoverStats = { sourceTotal: null, capHit: false };

const SOURCE = 'vcsa';
const BASE = 'https://vintagecarssa.co.za';
const API = `${BASE}/wp-json/wp/v2/buying-cars`;
const UA = 'Mozilla/5.0';
const PER_PAGE = 100;
const PAGE_CAP = 10;   // 1 000 cars; catalogue was 364 on 2026-07-15
const PHOTO_CAP = 20;  // matches the adios gallery cap

interface VcsaCar {
  id: number;
  link: string;
  title: { rendered: string };
  meta?: {
    car_price?: string;
    year?: string;
    engine?: string;
    model?: string;
    vehicle_location?: string;
    car_previously_sold?: string;
    'buying-car-overview'?: string;
    'buying-car-gallery'?: Array<{ id: number; url: string }>;
  };
}

// ── Text helpers ─────────────────────────────────────────────────────────────
// WP renders titles and overview copy pre-escaped ("6&#215;6", "Citro&euml;n").
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
  ndash: '–', mdash: '—', times: '×', deg: '°', euml: 'ë',
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

// VCSA's overview ends with the salesman's direct email and cell number. Every
// other source's description arrives contact-free because the portal strips it;
// here we're reading the dealer's own CMS, so we strip it ourselves. LCSA routes
// buyer contact through the listing page (/api/ingest overwrites seller_* with
// the LCSA address) and attributes the hand-off via track-click — publishing the
// raw number would leak that hand-off untracked and unmeasured.
const CONTACT_RE = /[\w.+-]+@[\w-]+\.[\w.]+|\b0\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/;
const CONTACT_LEAD_RE = /^contact\b.*\bon\b\s*:?\s*$/i;

function htmlToText(html: string): string {
  const raw = html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<[^>]+>/g, '');

  const lines = decodeEntities(raw)
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter(l => !CONTACT_RE.test(l) && !CONTACT_LEAD_RE.test(l));

  return lines.join('\n').trim();
}

// ── Field extraction ─────────────────────────────────────────────────────────
function priceFor(meta: VcsaCar['meta']): number {
  // Cars marked sold have car_price wiped, so a live car with no price is a
  // genuine POA — 0 renders as "POA" rather than a fake R0.
  return Number((meta?.car_price ?? '').replace(/[^0-9]/g, '')) || 0;
}

function yearFor(meta: VcsaCar['meta'], title: string): number {
  const fromMeta = meta?.year?.match(/\b(?:19|20)\d{2}\b/)?.[0];
  if (fromMeta) return Number(fromMeta);
  // Most VCSA titles lead with the year ("1972 Toyota Land Cruiser FJ45").
  const fromTitle = title.match(/\b(?:19|20)\d{2}\b/)?.[0];
  if (fromTitle) return Number(fromTitle);
  // Undated stock is VCSA's own new-build work (e.g. the 79 Series 6x6 demo
  // build), so the current year is the honest fallback — and `year` is a
  // required field on /api/ingest, which would 400 on 0.
  return new Date().getFullYear();
}

function transmissionFor(blob: string): 'manual' | 'automatic' {
  // Neither is a structured field; the overview copy always states one
  // ("paired with a manual transmission"). Classics default to manual.
  if (/\bmanual\b/i.test(blob)) return 'manual';
  if (/\bautomatic\b|\bauto\b/i.test(blob)) return 'automatic';
  return 'manual';
}

// VCSA's engine meta field is usually empty, but for chassis-coded classics the
// badge itself states the fuel: the first letter is the engine family — F = the
// petrol straight-six (F/2F), B and H = the diesels. Only trust the code on
// classic-era years (same reason as the year guard in normalizeModel: modern
// dealer titles reuse these strings as garbage, e.g. an FJ Cruiser sold as "FJ 62").
function fuelFromChassisCode(title: string, year: number): string | undefined {
  if (year > 1995) return undefined;
  if (/\bfj[\s-]?\d/i.test(title)) return 'Petrol';
  if (/\b[bh]j[\s-]?\d/i.test(title)) return 'Diesel';
  return undefined;
}

function photosFor(meta: VcsaCar['meta']): string[] {
  const gallery = meta?.['buying-car-gallery'];
  if (!Array.isArray(gallery)) return [];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const item of gallery) {
    const url = item?.url;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= PHOTO_CAP) break;
  }
  return urls;
}

// VCSA is a classic-car dealer, not a Land Cruiser specialist: only ~4 of 364
// cars are Cruisers, so discovery MUST filter rather than take the catalogue.
// Match on "Land Cruiser" (covers all 13 LCs they've listed to date) plus the
// bare chassis codes, in case they title one "1978 FJ40" with no model name.
// Chassis ranges mirror the classic patterns in normalize.ts MODEL_MAP.
const LC_RE = /land\s*cruiser|\b[fbh]j[\s-]?(?:4[0-7]|55|6[0-2]|7[5-9]|80)\b/i;

function isLandCruiser(car: VcsaCar): boolean {
  return LC_RE.test(decodeEntities(car.title?.rendered ?? '')) || LC_RE.test(car.meta?.model ?? '');
}

// Sold cars stay published forever as an archive — VCSA wipes the price but
// keeps the page. Filtering on the flag (not the URL 404ing) is the only way to
// keep the archive out of the live classifieds.
function isSold(car: VcsaCar): boolean {
  return (car.meta?.car_previously_sold ?? '').trim().toLowerCase() === 'sold';
}

function normalizeCar(car: VcsaCar): NormalizedListing | null {
  const title = decodeEntities(car.title?.rendered ?? '').replace(/\s+/g, ' ').trim();
  if (!title) return null;

  const meta = car.meta;
  const description = htmlToText(meta?.['buying-car-overview'] ?? '');
  const year = yearFor(meta, title);

  return {
    source: SOURCE,
    source_id: String(car.id),
    source_url: car.link,
    title,
    model: normalizeModel(title, year),
    year,
    price: priceFor(meta),
    // VCSA never publishes odometer readings — on a 50-year-old restoration it's
    // meaningless and the market doesn't price on it. 0 = unknown, as elsewhere.
    mileage: 0,
    province: 'Gauteng', // single showroom, Shere (Pretoria East)
    // NOT the `mileage > 0 ? 'Used' : 'New'` rule the other adapters use: with
    // mileage always 0 that would label a 1976 FJ40 "New".
    new_or_used: 'Used',
    transmission: transmissionFor(`${title}\n${description}`),
    colour: '',
    description,
    photos: photosFor(meta),
    seller_name: 'Vintage Cars SA',
    fuel_type: meta?.engine?.trim() || fuelFromChassisCode(title, year),
  };
}

// discover() pulls the whole catalogue; fetchListing() reads it back from here
// rather than re-fetching each car (the list response already carries every
// field, galleries included).
const _cache = new Map<string, VcsaCar>();

async function fetchAllCars(): Promise<VcsaCar[]> {
  const all: VcsaCar[] = [];
  let totalPages = 1;

  for (let page = 1; page <= PAGE_CAP; page++) {
    const url = `${API}?per_page=${PER_PAGE}&page=${page}&_fields=id,link,title,meta`;
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) break;

    if (page === 1) totalPages = Number(res.headers.get('x-wp-totalpages')) || 1;

    const batch = await res.json() as VcsaCar[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);

    if (page >= totalPages) break;
    if (page === PAGE_CAP) {
      discoverStats.capHit = true;
      console.warn(`[vcsa] stopped at the ${PAGE_CAP}-page cap but the source reports ${totalPages} pages — later cars were not crawled`);
    }
  }
  return all;
}

export const VcsaAdapter: SourceAdapter = {
  source: SOURCE,

  async discover(): Promise<DiscoveredRef[]> {
    discoverStats.sourceTotal = null;
    discoverStats.capHit = false;

    // VCSA has never stocked a Jimny, but a jimny-segment run must never be able
    // to dump Land Cruisers onto the Jimny site — bail rather than filter.
    if (process.env.SCRAPE_SEGMENT === 'jimny') {
      console.log('[vcsa] jimny segment — VCSA carries no Jimny stock, skipping');
      return [];
    }

    const cars = await fetchAllCars();
    _cache.clear();

    const live = cars.filter(c => isLandCruiser(c) && !isSold(c));
    const soldCount = cars.filter(c => isLandCruiser(c) && isSold(c)).length;
    console.log(`[vcsa] ${cars.length} cars in catalogue — ${live.length} live Land Cruisers (${soldCount} sold, archived)`);

    for (const car of live) _cache.set(String(car.id), car);

    return live.map(car => ({
      source: SOURCE,
      source_id: String(car.id),
      source_url: car.link,
    }));
  },

  async fetchListing(ref: DiscoveredRef): Promise<NormalizedListing | null> {
    let car = _cache.get(ref.source_id);
    if (!car) {
      const res = await fetch(`${API}/${ref.source_id}?_fields=id,link,title,meta`, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      }).catch(() => null);
      if (!res?.ok) return null;
      car = await res.json() as VcsaCar;
    }
    if (!car || isSold(car)) return null;
    return normalizeCar(car);
  },

  async isStillLive(ref: DiscoveredRef): Promise<LivenessResult> {
    try {
      const res = await fetch(`${API}/${ref.source_id}?_fields=id,meta`, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 404) return 'removed';
      if (!res.ok) return 'unknown';
      // The page outlives the sale — the flag is what goes off-market.
      const car = await res.json() as VcsaCar;
      return isSold(car) ? 'removed' : 'live';
    } catch {
      return 'unknown';
    }
  },
};
