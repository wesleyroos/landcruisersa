import { normalizeModel, normalizeProvince } from './normalize.ts';
import type { DiscoveredRef, NormalizedListing, LivenessResult, SourceAdapter } from './types.ts';

const SOURCE = 'wbb';
const BASE = 'https://webuybakkies.co.za';

const LC_SLUGS = ['toyota-land-cruiser', 'toyota-fj-cruiser', 'toyota-prado'];

async function fetchSitemapUrls(): Promise<string[]> {
  const urls: string[] = [];
  for (let i = 1; i <= 10; i++) {
    const res = await fetch(`${BASE}/wp-sitemap-posts-vehicle-${i}.xml`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) break;
    const xml = await res.text();
    for (const m of xml.matchAll(/<loc>(https:\/\/webuybakkies\.co\.za\/vehicles\/[^<]+)<\/loc>/g)) {
      urls.push(m[1].trim());
    }
  }
  return urls;
}

function isLandCruiser(url: string): boolean {
  const slug = url.toLowerCase();
  return LC_SLUGS.some(p => slug.includes(p));
}

// Extract stock ID from URL: /vehicles/toyota-land-cruiser-70-42730-557/ → "42730"
function stockIdFromUrl(url: string): string {
  const m = url.match(/\/vehicles\/[^/]+-(\d+)-\d+\/?$/);
  return m?.[1] ?? '';
}

function parseListing(html: string, sourceUrl: string): NormalizedListing | null {
  // Title
  const title =
    html.match(/property="og:title"\s+content="([^"]+)"/)?.[1]?.trim() ??
    html.match(/<title>([^|<]+)/)?.[1]?.trim() ?? '';

  // Price — require proper ZAR format (6+ digits or thousands-separated) to avoid
  // matching model numbers like "R76" from og:description.
  // Pattern matches: "R489 000", "R489,000", "R489000", "R1 299 000"
  const ZAR_PRICE = /R\s*((?:\d{1,3}[\s,]\d{3}(?:[\s,]\d{3})*|\d{6,})(?:\.\d+)?)/;
  const ogDesc = html.match(/property="og:description"\s+content="([^"]+)"/)?.[1] ?? '';
  const priceFromMeta = ogDesc.match(ZAR_PRICE)?.[1];
  const priceFromBody = html.match(ZAR_PRICE)?.[1];
  const priceRaw = priceFromMeta ?? priceFromBody ?? '0';
  // Use parseInt so "489,000.00" → strip separators → "489000.00" → parseInt stops at decimal → 489000
  const price = parseInt(priceRaw.replace(/[\s,]/g, ''), 10) || 0;

  // Spec table: Elementor `.td-content` cells come in label/value pairs.
  // Labels have a trailing colon (e.g. "YEAR MODEL:") — strip it for consistent key lookup.
  const cells = [...html.matchAll(/class="td-content[^"]*"[^>]*>([^<]*)</g)]
    .map(m => m[1].trim())
    .filter(Boolean);

  const specs: Record<string, string> = {};
  for (let i = 0; i + 1 < cells.length; i += 2) {
    specs[cells[i].toLowerCase().trim().replace(/:$/, '')] = cells[i + 1];
  }

  const yearRaw = specs['year model'] ?? specs['year'] ?? '';
  const year = Number(yearRaw.match(/\d{4}/)?.[0]) || new Date().getFullYear();

  const mileage = Number((specs['mileage'] ?? '').replace(/[^0-9]/g, '')) || 0;

  const transRaw = (specs['transmission'] ?? '').toLowerCase();
  const transmission: 'manual' | 'automatic' = transRaw.includes('auto') ? 'automatic' : 'manual';

  const colour = specs['colour'] ?? specs['color'] ?? '';

  // Photos — VMG S3 images embedded in the page
  const seen = new Set<string>();
  const photos: string[] = [];
  for (const m of html.matchAll(/https:\/\/s3[^"'\s]+vmg\.images\.production[^"'\s]+\.jpg/gi)) {
    const u = m[0];
    if (!seen.has(u)) { seen.add(u); photos.push(u); }
  }

  // Province — look for city name near "Branch" or in page title
  let province = '';
  const locMatch = html.match(/(?:Branch|Location|City)[^:]*:\s*<[^>]*>([^<]+)/i) ??
                   html.match(/(?:Branch|Location)\s*[:-]\s*([A-Za-z\s]+)/i);
  if (locMatch) province = normalizeProvince(locMatch[1].trim());

  // source_id from URL slug
  const source_id = stockIdFromUrl(sourceUrl);
  if (!source_id) return null;

  // Description
  const descMatch = html.match(/<p>([^<]{80,})<\/p>/);
  const description = descMatch?.[1]?.trim().replace(/\s+/g, ' ') ?? '';

  return {
    source: SOURCE,
    source_id,
    source_url: sourceUrl,
    title: title.replace(/\s+/g, ' '),
    model: normalizeModel(title, year),
    year,
    price,
    mileage,
    province,
    new_or_used: mileage > 0 ? 'Used' : 'New',
    transmission,
    colour,
    description,
    photos,
    seller_name: 'WeBuy Bakkies',
    listing_type: 'for_sale',
  };
}

export const WbbAdapter: SourceAdapter = {
  source: SOURCE,

  async discover(): Promise<DiscoveredRef[]> {
    const all = await fetchSitemapUrls();
    return all
      .filter(isLandCruiser)
      .map(url => ({ source: SOURCE, source_id: stockIdFromUrl(url), source_url: url }))
      .filter(r => r.source_id);
  },

  async fetchListing(ref: DiscoveredRef): Promise<NormalizedListing | null> {
    const res = await fetch(ref.source_url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    return parseListing(html, ref.source_url);
  },

  async isStillLive(ref: DiscoveredRef): Promise<LivenessResult> {
    try {
      const res = await fetch(ref.source_url, {
        method: 'HEAD',
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 404) return 'removed';
      if (res.ok) return 'live';
      return 'unknown';
    } catch {
      return 'unknown';
    }
  },
};
