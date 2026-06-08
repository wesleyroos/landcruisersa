import { politeFetch } from './http.ts';
import { normalizeModel, normalizeProvince } from './normalize.ts';
import type { DiscoveredRef, NormalizedListing, LivenessResult, SourceAdapter } from './types.ts';

const SOURCE = 'autotrader';
const BASE = 'https://www.autotrader.co.za';
const SEARCH_PAGE = `${BASE}/cars-for-sale/toyota/land-cruiser`;

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function extractListingsFromHtml(html: string): Array<{ id: string; url: string }> {
  // AutoTrader SSR embeds listing data as props to the SearchPageView component
  const pairs: Array<{ id: string; url: string }> = [];
  const seen = new Set<string>();
  const matches = html.matchAll(/"listingId":(\d+),"canonicalUrl":"([^"]+)"/g);
  for (const m of matches) {
    const id = m[1];
    if (!seen.has(id)) {
      seen.add(id);
      pairs.push({ id, url: m[2] });
    }
  }
  return pairs;
}

function parseMileage(raw: string | number): number {
  if (typeof raw === 'number') return raw;
  // AutoTrader formats mileage with comma thousands: "105,000000"
  return Number(String(raw).replace(/,/g, '').replace(/\s/g, '')) || 0;
}

export const AutoTraderAdapter: SourceAdapter = {
  source: SOURCE,

  async discover(): Promise<DiscoveredRef[]> {
    const refs: DiscoveredRef[] = [];

    const res = await politeFetch(SEARCH_PAGE, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': BROWSER_UA,
        'Accept-Language': 'en-ZA,en;q=0.9',
      },
    });
    if (!res.ok) return refs;

    const html = await res.text();
    const items = extractListingsFromHtml(html);

    for (const item of items) {
      refs.push({
        source: SOURCE,
        source_id: item.id,
        source_url: item.url.startsWith('http') ? item.url : `${BASE}${item.url}`,
      });
    }

    return refs;
  },

  async fetchListing(ref: DiscoveredRef): Promise<NormalizedListing | null> {
    const res = await politeFetch(ref.source_url, {
      headers: { 'User-Agent': BROWSER_UA },
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;

    const html = await res.text();

    // Extract JSON-LD structured data
    let vehicleData: Record<string, unknown> = {};
    const ldMatches = html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
    for (const m of ldMatches) {
      try {
        const parsed = JSON.parse(m[1]);
        const types = ([] as string[]).concat(parsed['@type'] ?? []);
        if (types.some(t => ['Vehicle', 'Car', 'Product'].includes(t))) {
          vehicleData = parsed;
          break;
        }
      } catch { /* ignore */ }
    }

    if (!vehicleData.name) return null;

    const title = String(vehicleData.name ?? '');
    const modelDate = String(vehicleData.modelDate ?? vehicleData.vehicleModelDate ?? '');
    const year = modelDate ? new Date(modelDate).getFullYear() : new Date().getFullYear();
    const offerData = vehicleData.offers as Record<string, unknown> | undefined;
    const price = Number(offerData?.price ?? vehicleData.price ?? 0);
    const mileageData = vehicleData.mileageFromOdometer as Record<string, unknown> | undefined;
    const mileage = parseMileage(mileageData?.value ?? vehicleData.mileage ?? 0);
    const province = normalizeProvince(
      String((vehicleData.displayLocation as Record<string, unknown>)?.address ?? vehicleData.province ?? '')
    );
    const colour = String(vehicleData.color ?? vehicleData.colour ?? '');
    const description = String(vehicleData.description ?? '');
    const transmissionRaw = String(vehicleData.vehicleTransmission ?? vehicleData.transmission ?? '').toLowerCase();
    const transmission: 'manual' | 'automatic' = transmissionRaw.includes('auto') ? 'automatic' : 'manual';
    const seller = offerData?.seller as Record<string, unknown> | undefined;
    const seller_name = String(seller?.name ?? vehicleData.seller ?? 'AutoTrader Dealer');
    const fuelRaw = String(vehicleData.fuelType ?? '');
    const fuel_type = fuelRaw || undefined;

    // Collect all unique image URLs from the page
    const imgSet = new Set<string>();
    // JSON-LD image first
    const ldImg = vehicleData.image;
    if (typeof ldImg === 'string') imgSet.add(ldImg);
    // All img.autotrader.co.za occurrences from HTML
    for (const m of html.matchAll(/https:\/\/img\.autotrader\.co\.za\/\d+/g)) {
      imgSet.add(m[0]);
    }
    const photos = Array.from(imgSet).slice(0, 20);

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
    const res = await politeFetch(ref.source_url, {
      method: 'HEAD',
      headers: { 'User-Agent': BROWSER_UA },
    });
    if (res.status === 404) return 'removed';
    if (res.ok) return 'live';
    return 'unknown';
  },
};
