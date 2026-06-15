import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import { normalizeModel, normalizeProvince } from './normalize.ts';
import { collectExtraSegments } from './registry.ts';
import type { DiscoveredRef, DiscoverStats, NormalizedListing, LivenessResult, SourceAdapter } from './types.ts';

// Source-reported penetration stats from the last discover() — read by the ingest script.
// cars.co.za exposes a per-model meta.total and we paginate to exhaustion, so this is a
// clean denominator: found ÷ source_total ≈ true coverage of cars.co.za's LC stock.
export const discoverStats: DiscoverStats = { sourceTotal: null, capHit: false };

const SOURCE = 'carsza';
const API = 'https://api.cars.co.za/fw/public/v3/vehicle';
const PAGE_SIZE = 50;
const MAX_PHOTOS = 15;

// Cars.co.za model names under make Toyota that map to Land Cruisers.
// Each is queried via make_model_variant[Toyota][<name>][All].
const LC_MODELS = [
  'Land Cruiser 79',
  'Land Cruiser 76',
  'Land Cruiser 78',
  'Land Cruiser 70',
  'Land Cruiser 80',
  'Land Cruiser 100',
  'Land Cruiser 105',
  'Land Cruiser 200',
  'Land Cruiser 300',
  'Land Cruiser Prado',
  'FJ Cruiser',
  'Land Cruiser FJ',
];
// Adjacent Toyota 4x4s — collected for data, gated, not shown on the LC site
const EXTRA_MODELS = ['Hilux', 'Fortuner'];
// Built per-run inside discover() so the Hilux/Fortuner toggle is read at
// runtime (after applyExtraSegments), not frozen at module load.
function searchModels(): string[] {
  return collectExtraSegments() ? [...LC_MODELS, ...EXTRA_MODELS] : LC_MODELS;
}

interface CarsZaRecord {
  id: string;
  attributes: {
    title: string;
    model: string;
    year: number;
    price: number;
    mileage: string;          // "38 329 Km"
    province: string;
    new_or_used: string;
    transmission: string;
    colour: string;
    description: string;
    fuel_type: string;
    seats: string;
    agent_name: string;
    website_url: string;
    image: { version: number; count: number; name: string };
  };
}

// The whole site (www + api) sits behind Cloudflare managed challenges that
// only a real, headed Chrome passes — so discovery drives the user's installed
// Chrome via playwright-core and calls the JSON API from inside the page
// context, where the CF clearance cookie applies. Local runs only.
const cache = new Map<string, NormalizedListing>();

function photoUrls(rec: CarsZaRecord): string[] {
  const { name, count, version } = rec.attributes.image;
  if (!name || !count) return [];
  const urls: string[] = [];
  for (let n = 1; n <= Math.min(count, MAX_PHOTOS); n++) {
    // First image has no suffix; the rest are {id}_2, {id}_3, …
    const file = n === 1 ? name : `${name}_${n}`;
    urls.push(`https://img-ik.cars.co.za/ik-seo/carsimages/tr:w-1200,f-auto/${file}/${name}.jpg?v=${version}`);
  }
  return urls;
}

function toListing(rec: CarsZaRecord): NormalizedListing | null {
  const a = rec.attributes;
  if (!a?.title || !a.year || !a.website_url) return null;
  const seats = parseInt(a.seats, 10);
  return {
    source: SOURCE,
    source_id: String(rec.id),
    source_url: a.website_url,
    title: a.title,
    model: normalizeModel(`${a.model} ${a.title}`, a.year),
    year: a.year,
    price: Number(a.price) || 0,
    mileage: parseInt(String(a.mileage).replace(/\D/g, ''), 10) || 0,
    province: normalizeProvince(a.province ?? ''),
    new_or_used: a.new_or_used === 'New' ? 'New' : 'Used',
    transmission: /auto/i.test(a.transmission ?? '') ? 'automatic' : 'manual',
    colour: a.colour ?? '',
    description: a.description || a.title,
    photos: photoUrls(rec),
    seller_name: a.agent_name || 'Cars.co.za dealer',
    ...(a.fuel_type ? { fuel_type: a.fuel_type } : {}),
    ...(Number.isFinite(seats) && seats > 0 ? { seats } : {}),
  };
}

async function apiGet(page: Page, qs: string): Promise<{ meta?: { total: number }; data?: CarsZaRecord[] }> {
  return page.evaluate(async (q) => {
    const r = await fetch(`https://api.cars.co.za/fw/public/v3/vehicle?${q}`, {
      headers: { Accept: 'application/json' },
    });
    if (!r.ok) throw new Error(`api.cars.co.za ${r.status}`);
    return r.json();
  }, qs);
}

async function launchSession(): Promise<{ browser: Browser; page: Page }> {
  // Headed real Chrome — headless (old and new) gets served the CF challenge.
  // The window is parked offscreen so scheduled runs don't interrupt the user.
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    args: ['--window-position=-32000,-32000'],
  });
  const page = await browser.newPage();
  await page.goto('https://www.cars.co.za/usedcars/Toyota/Land-Cruiser-79/', {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  // Give the CF managed challenge time to clear and set cookies
  for (let i = 0; i < 20; i++) {
    const title = await page.title();
    if (!/just a moment/i.test(title)) break;
    await page.waitForTimeout(1000);
  }
  if (/just a moment/i.test(await page.title())) {
    await browser.close();
    throw new Error('Cloudflare challenge did not clear — try again or run headed interactively');
  }
  return { browser, page };
}

export const CarsZaAdapter: SourceAdapter = {
  source: SOURCE,

  async discover(): Promise<DiscoveredRef[]> {
    cache.clear();
    discoverStats.sourceTotal = null;
    discoverStats.capHit = false;
    let reportedTotal = 0;
    const { browser, page } = await launchSession();
    try {
      for (const model of searchModels()) {
        const filter = `make_model_variant[Toyota][${encodeURIComponent(model)}][All]`;
        let offset = 0;
        let total = Infinity;
        while (offset < total) {
          const json = await apiGet(page, `page[offset]=${offset}&page[limit]=${PAGE_SIZE}&${filter}&sort[date]=desc`);
          total = json.meta?.total ?? 0;
          const batch = json.data ?? [];
          if (batch.length === 0) break;
          for (const rec of batch) {
            const listing = toListing(rec);
            if (listing) cache.set(listing.source_id, listing);
          }
          offset += batch.length;
          await page.waitForTimeout(400); // polite pacing
        }
        if (total !== Infinity) reportedTotal += total; // sum the per-model totals cars.co.za reports
        console.log(`[${SOURCE}] ${model}: ${Math.min(total, offset)} listings`);
      }
      discoverStats.sourceTotal = reportedTotal;
    } finally {
      await browser.close();
    }
    return [...cache.values()].map(l => ({
      source: SOURCE,
      source_id: l.source_id,
      source_url: l.source_url,
    }));
  },

  async fetchListing(ref: DiscoveredRef): Promise<NormalizedListing | null> {
    // discover() already returned full records — no per-listing fetch needed
    return cache.get(ref.source_id) ?? null;
  },

  async isStillLive(_ref: DiscoveredRef): Promise<LivenessResult> {
    // The GH Actions poller can't reach cars.co.za (Cloudflare blocks datacenter
    // IPs). Liveness is handled by the ingest sweep instead: discover() sees every
    // live LC, and ingest-carsza marks anything missing as removed.
    return 'unknown';
  },
};
