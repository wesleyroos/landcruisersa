import { normalizeModel, normalizeProvince } from './normalize.ts';
import type { DiscoveredRef, DiscoverStats, NormalizedListing, LivenessResult, SourceAdapter } from './types.ts';

// Penetration stats from the last discover(). Adios is a single fetch with
// per_page=100 and no pagination loop, so if it ever returns a full 100 we've
// almost certainly truncated — flag it. No clean total is exposed.
export const discoverStats: DiscoverStats = { sourceTotal: null, capHit: false };
const ADIOS_PAGE_CAP = 100;

const SOURCE = 'adios';
const BASE = 'https://adios.co.za';
const API = `${BASE}/wp-json/vehica/v1/cars`;
const MEDIA_API = `${BASE}/wp-json/wp/v2/media`;

interface VehicaAttr {
  name: string;
  type: string;
  value: unknown;
  displayValue: unknown;
}

interface VehicaListing {
  id: number;
  name: string;
  slug: string;
  url: string;
  attributes: VehicaAttr[];
}

interface VehicaResponse {
  resultsCount: number;
  results: VehicaListing[];
}

function attrValue(attrs: VehicaAttr[], name: string): string {
  const a = attrs.find(x => x.name.toLowerCase() === name.toLowerCase());
  if (!a) return '';
  const v = a.value;
  if (Array.isArray(v)) return v.map((x: unknown) => (typeof x === 'object' && x !== null ? (x as Record<string, unknown>).name : x)).filter(Boolean).join(', ');
  if (typeof v === 'object' && v !== null) {
    // Price dict: {"vehica_currency_XXXX": 375000}
    const vals = Object.values(v as Record<string, unknown>);
    return vals.length ? String(vals[0]) : '';
  }
  return String(v ?? '');
}

function parsePrice(raw: string): number {
  // "375000" or "R375 000" -> 375000
  return Number(raw.replace(/[^0-9]/g, '')) || 0;
}

function parseMileage(raw: string): number {
  return Number(raw.replace(/[^0-9]/g, '')) || 0;
}

async function fetchGalleryUrls(galleryIds: string[]): Promise<string[]> {
  if (galleryIds.length === 0) return [];
  const ids = galleryIds.slice(0, 20).join(',');
  try {
    const res = await fetch(`${MEDIA_API}?include=${ids}&_fields=id,source_url&per_page=100`);
    if (!res.ok) return [];
    const media = await res.json() as Array<{ id: number; source_url: string }>;
    // WordPress ignores include= ordering; re-sort to match original gallery order
    const byId = new Map(media.map(m => [String(m.id), m.source_url]));
    return galleryIds.slice(0, 20).map(id => byId.get(id)).filter(Boolean) as string[];
  } catch {
    return [];
  }
}

function normalizeAdiosListing(item: VehicaListing): NormalizedListing | null {
  const attrs = item.attributes ?? [];

  const offerType = attrValue(attrs, 'Offer type');
  // Skip listings marked as SOLD at discovery time — they'll be removed via liveness poll
  // (We still ingest them; the DB handles status)

  const year = Number(attrValue(attrs, 'Year')) || new Date().getFullYear();
  const priceRaw = attrValue(attrs, 'Price');
  const price = parsePrice(priceRaw);
  const mileageRaw = attrValue(attrs, 'Mileage');
  const mileage = parseMileage(mileageRaw);
  const colour = attrValue(attrs, 'Colour');
  const transmissionRaw = attrValue(attrs, 'Transmission').toLowerCase();
  const transmission: 'manual' | 'automatic' = transmissionRaw.includes('auto') ? 'automatic' : 'manual';
  const fuelRaw = attrValue(attrs, 'Fuel Type');
  const fuel_type = fuelRaw || undefined;

  // Gallery IDs come as comma-separated WordPress attachment IDs
  const galleryRaw = attrValue(attrs, 'Gallery');
  const galleryIds = galleryRaw ? galleryRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

  return {
    source: SOURCE,
    source_id: String(item.id),
    source_url: item.url,
    title: item.name,
    model: normalizeModel(item.name, year),
    year,
    price,
    mileage,
    province: normalizeProvince('Gauteng'), // Adios is a Pretoria dealership
    new_or_used: mileage > 0 ? 'Used' : 'New',
    transmission,
    colour,
    description: '',
    photos: [], // filled in by fetchListing via gallery IDs
    seller_name: 'Adios 4x4',
    fuel_type,
    _galleryIds: galleryIds, // internal, stripped before return
  } as NormalizedListing & { _galleryIds: string[] };
}

// Vehica API ignores ?include= filter — always returns all results.
// Cache from discover() so fetchListing can look up by ID without re-fetching.
const _listingCache = new Map<string, VehicaListing>();

// Adios 4x4 is a Pretoria Land Cruiser / Toyota 4x4 specialist — its entire
// inventory is Land Cruisers (+ the odd vintage Toyota / Lexus). The Vehica API
// DOES honour taxonomy filters (make/model), so a Jimny run asks for Suzuki Jimny
// explicitly; in practice this returns zero (Adios carries no Jimny). The gate is
// here purely so a SCRAPE_SEGMENT=jimny run can NEVER dump Adios's Land Cruisers
// onto the Jimny site — it asks for Jimny and gets nothing, rather than the
// unfiltered full inventory. Land Cruiser runs are unchanged (no query params).
function listingsQuery(): string {
  if (process.env.SCRAPE_SEGMENT === 'jimny') return '?make=suzuki&model=jimny&per_page=100';
  return '?per_page=100';
}

async function fetchAllListings(): Promise<VehicaListing[]> {
  const res = await fetch(`${API}${listingsQuery()}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) return [];
  const data = await res.json() as VehicaResponse;
  return data.results ?? [];
}

export const AdiosAdapter: SourceAdapter = {
  source: SOURCE,

  async discover(): Promise<DiscoveredRef[]> {
    const results = await fetchAllListings();
    discoverStats.sourceTotal = null;
    discoverStats.capHit = results.length >= ADIOS_PAGE_CAP;
    if (discoverStats.capHit) {
      console.warn(`[adios] returned a full ${ADIOS_PAGE_CAP} with no pagination — listings beyond ${ADIOS_PAGE_CAP} are not fetched`);
    }
    for (const item of results) {
      _listingCache.set(String(item.id), item);
    }
    return results.map(item => ({
      source: SOURCE,
      source_id: String(item.id),
      source_url: item.url,
    }));
  },

  async fetchListing(ref: DiscoveredRef): Promise<NormalizedListing | null> {
    let item = _listingCache.get(ref.source_id);
    if (!item) {
      const results = await fetchAllListings();
      item = results.find(r => String(r.id) === ref.source_id);
    }
    if (!item) return null;

    const listing = normalizeAdiosListing(item) as NormalizedListing & { _galleryIds?: string[] };
    if (!listing) return null;

    const galleryIds = listing._galleryIds ?? [];
    delete (listing as Record<string, unknown>)._galleryIds;

    listing.photos = await fetchGalleryUrls(galleryIds);
    return listing;
  },

  async isStillLive(ref: DiscoveredRef): Promise<LivenessResult> {
    try {
      const results = await fetchAllListings();
      const item = results.find(r => String(r.id) === ref.source_id);
      if (!item) return 'removed';
      const offerType = attrValue(item.attributes ?? [], 'Offer type');
      if (offerType.toLowerCase() === 'sold') return 'removed';
      return 'live';
    } catch {
      return 'unknown';
    }
  },
};
