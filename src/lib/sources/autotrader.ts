import { politeFetch } from './http.ts';
import { normalizeModel, normalizeProvince } from './normalize.ts';
import type { DiscoveredRef, NormalizedListing, LivenessResult, SourceAdapter } from './types.ts';

const SOURCE = 'autotrader';
const BASE = 'https://www.autotrader.co.za';

// AutoTrader's internal search API — returns JSON, much easier than HTML scraping
const SEARCH_URL = `${BASE}/api/search?make=Toyota&model=Land+Cruiser&pageSize=96&sortBy=relevance`;

interface ATSearchResult {
  id: string;
  url: string;
}

interface ATSearchResponse {
  data?: { items?: ATSearchResult[] };
  listings?: { id: string; url: string }[];
}

export const AutoTraderAdapter: SourceAdapter = {
  source: SOURCE,

  async discover(): Promise<DiscoveredRef[]> {
    const refs: DiscoveredRef[] = [];
    let page = 1;
    const seenIds = new Set<string>();

    while (true) {
      const url = `${SEARCH_URL}&page=${page}`;
      const res = await politeFetch(url, {
        headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      });

      if (!res.ok) break;

      const json: ATSearchResponse = await res.json().catch(() => ({}));

      // AutoTrader has varied response shapes; try both
      const items: ATSearchResult[] =
        json?.data?.items ??
        json?.listings ??
        [];

      if (items.length === 0) break;

      for (const item of items) {
        if (!item.id || seenIds.has(item.id)) continue;
        seenIds.add(item.id);
        const path = item.url ?? `/car-for-sale/toyota/land-cruiser/${item.id}`;
        refs.push({
          source: SOURCE,
          source_id: String(item.id),
          source_url: path.startsWith('http') ? path : `${BASE}${path}`,
        });
      }

      // AutoTrader typically has 96 items per page; if fewer, we're on the last page
      if (items.length < 96) break;
      page++;
    }

    return refs;
  },

  async fetchListing(ref: DiscoveredRef): Promise<NormalizedListing | null> {
    const res = await politeFetch(ref.source_url);
    if (res.status === 404) return null;
    if (!res.ok) return null;

    const html = await res.text();

    // AutoTrader embeds listing data as JSON-LD or in window.__INITIAL_STATE__
    const ldMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
    let vehicleData: Record<string, unknown> = {};
    if (ldMatch) {
      for (const block of ldMatch) {
        try {
          const inner = block.replace(/<\/?script[^>]*>/gi, '');
          const parsed = JSON.parse(inner);
          if (parsed['@type'] === 'Vehicle' || parsed['@type'] === 'Car') {
            vehicleData = parsed;
            break;
          }
        } catch { /* ignore */ }
      }
    }

    // Fallback: try window.__INITIAL_STATE__ (a large JSON blob)
    if (!vehicleData.name) {
      const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});?\s*(?:window|<\/script)/);
      if (stateMatch) {
        try {
          const state = JSON.parse(stateMatch[1]);
          // Path varies; try common locations
          const listing =
            state?.listing?.data ??
            state?.listingDetail?.listing ??
            state?.advert ??
            {};
          if (listing.title || listing.heading) {
            vehicleData = listing;
          }
        } catch { /* ignore */ }
      }
    }

    if (!vehicleData.name && !vehicleData.title && !vehicleData.heading) return null;

    const title = String(vehicleData.name ?? vehicleData.title ?? vehicleData.heading ?? '');
    const year = Number(vehicleData.vehicleModelDate ?? vehicleData.year ?? new Date().getFullYear());
    const priceRaw = (vehicleData as Record<string, unknown>)?.offers as Record<string, unknown> | undefined;
    const price = Number(priceRaw?.price ?? vehicleData.price ?? 0);
    const mileage = Number(
      (vehicleData.mileageFromOdometer as Record<string, unknown>)?.value ??
      vehicleData.mileage ??
      0
    );
    const province = normalizeProvince(
      String(vehicleData.spatialCoverage ?? vehicleData.province ?? vehicleData.region ?? '')
    );
    const colour = String(vehicleData.color ?? vehicleData.colour ?? '');
    const description = String(vehicleData.description ?? '');
    const photos: string[] = [];
    const rawImages = vehicleData.image ?? vehicleData.images ?? [];
    if (Array.isArray(rawImages)) {
      photos.push(...rawImages.slice(0, 20).map(String));
    } else if (typeof rawImages === 'string') {
      photos.push(rawImages);
    }
    const transmissionRaw = String(vehicleData.vehicleTransmission ?? vehicleData.transmission ?? '').toLowerCase();
    const transmission: 'manual' | 'automatic' = transmissionRaw.includes('auto') ? 'automatic' : 'manual';
    const seller = (vehicleData.offers as Record<string, unknown>)?.seller as Record<string, unknown> | undefined;
    const seller_name = String(seller?.name ?? vehicleData.seller ?? vehicleData.dealerName ?? 'AutoTrader Dealer');
    const fuelRaw = String(vehicleData.fuelType ?? vehicleData.fuel_type ?? '');
    const fuel_type = fuelRaw || undefined;

    return {
      source: SOURCE,
      source_id: ref.source_id,
      source_url: ref.source_url,
      title,
      model: normalizeModel(title),
      year,
      price,
      mileage,
      province,
      new_or_used: mileage > 0 ? 'Used' : 'New',
      transmission,
      colour,
      description,
      photos,
      seller_name,
      fuel_type,
    };
  },

  async isStillLive(ref: DiscoveredRef): Promise<LivenessResult> {
    const res = await politeFetch(ref.source_url, { method: 'HEAD' });
    if (res.status === 404) return 'removed';
    if (res.ok) return 'live';
    return 'unknown';
  },
};
