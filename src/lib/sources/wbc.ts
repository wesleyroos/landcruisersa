import { createHash } from 'crypto';
import { politeFetch } from './http.ts';
import { normalizeModel, normalizeProvince } from './normalize.ts';
import { collectExtraSegments } from './registry.ts';
import type { DiscoveredRef, NormalizedListing, LivenessResult, SourceAdapter } from './types.ts';

const SOURCE = 'wbc';
const BASE = 'https://www.webuycars.co.za';
const GATEWAY = 'https://appgateway.webuycars.co.za';
const POW_FINGERPRINT = 'lcsa-scraper-wbc-001xxxxx';

// ─── Proof-of-work ─────────────────────────────────────────────────────────

function checkComplexity(hash: number[], difficulty: number): boolean {
  let n = 0, o = 0;
  for (; n <= difficulty - 8; n += 8, o++) if (hash[o] !== 0) return false;
  const mask = (255 << (8 + n - difficulty)) & 0xFF;
  return (hash[o] & mask) === 0;
}

function genNonce(): number[] {
  const buf = new Array(16).fill(0);
  const t = Date.now();
  buf[0] = (t / 4294967296 >>> 0) >>> 24 & 0xFF;
  buf[1] = (t / 4294967296 >>> 0) >>> 16 & 0xFF;
  buf[2] = (t / 4294967296 >>> 0) >>> 8 & 0xFF;
  buf[3] = (t / 4294967296 >>> 0) & 0xFF;
  buf[4] = (t & 0xFFFFFFFF) >>> 24 & 0xFF;
  buf[5] = (t & 0xFFFFFFFF) >>> 16 & 0xFF;
  buf[6] = (t & 0xFFFFFFFF) >>> 8 & 0xFF;
  buf[7] = (t & 0xFFFFFFFF) & 0xFF;
  for (let i = 8; i < 16; i++) buf[i] = Math.random() * 256 >>> 0;
  return buf;
}

let _powToken: string | null = null;
let _powExpiry = 0;

async function getPowToken(): Promise<string> {
  if (_powToken && Date.now() < _powExpiry) return _powToken;

  const chalRes = await fetch(`${GATEWAY}/website-nest-backend/api/v1/proof-of-work/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: JSON.stringify({ fingerprintId: POW_FINGERPRINT }),
  });
  const { challenge, difficulty } = await chalRes.json() as { challenge: string; difficulty: number };

  const challengeBytes = Buffer.from(challenge, 'hex');
  let nonce: number[];
  while (true) {
    nonce = genNonce();
    const hash = Array.from(
      createHash('sha256').update(challengeBytes).update(Buffer.from(nonce)).digest()
    );
    if (checkComplexity(hash, difficulty)) break;
  }

  const valRes = await fetch(
    `${GATEWAY}/website-nest-backend/api/v1/proof-of-work/validate?fingerprintId=${POW_FINGERPRINT}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      body: JSON.stringify({ fingerprintId: POW_FINGERPRINT, challenge, token: nonce!.toString() }),
    }
  );
  const { token } = await valRes.json() as { token: string };
  _powToken = token;
  // The token is a short-lived JWT (observed exp − iat = 60s). Read the real
  // expiry from the payload and refresh 10s early; fall back to 45s.
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    _powExpiry = payload.exp * 1000 - 10_000;
  } catch {
    _powExpiry = Date.now() + 45_000;
  }
  return token;
}

// ─── Search-based discovery ──────────────────────────────────────────────────
// The public sitemap only carries a fraction of WBC's inventory (~8k of a much
// larger pool) and silently misses whole model groups — e.g. every Land
// Cruiser 79 (discovered 2026-06-11). The website's own search endpoint sees
// everything, so discovery paginates that instead. It needs the same
// proof-of-work token as get-car.

const SEARCH_QUERIES = [
  'Toyota Land Cruiser', 'Toyota Prado', 'Toyota FJ Cruiser',
  ...(collectExtraSegments() ? ['Toyota Hilux', 'Toyota Fortuner'] : []),
];
const SEARCH_PAGE = 24; // server caps page size at 24 regardless of `size`

// Full body shape required — the endpoint 400s on missing keys
function searchBody(q: string, to: number) {
  return {
    to, size: SEARCH_PAGE, type: null, filter_type: 'all', subcategory: null, q,
    Make: null, Roadworthy: null, Auctions: [], Model: null, Variant: null,
    Province: null, DealerKey: null, FuelType: null,
    Fuel_Consumption_Gte: 0, Fuel_Consumption_Lte: 0, BodyType: null, Gearbox: null,
    AxleConfiguration: null, Colour: null, Seats: null, FinanceGrade: null,
    Priced_Amount_Gte: 0, Priced_Amount_Lte: 0,
    MonthlyInstallment_Amount_Gte: 0, MonthlyInstallment_Amount_Lte: 0,
    auctionDate: null, auctionEndDate: null, auctionEndHour: null, auctionDurationInSeconds: null,
    Kilometers_Gte: 0, Kilometers_Lte: 0, Year_Gte: null, Year_Lte: null,
    Priced_Amount_Sort: '', Bid_Amount_Sort: '', Kilometers_Sort: '', Year_Sort: '',
    Fuel_Consumption_Sort: '', Auction_Date_Sort: '', Auction_Lot_Sort: '', Year: null,
    Price_Update_Date_Sort: '', Online_Auction_Date_Sort: '', Online_Auction_In_Progress: '',
    VehicleStatus: null, BestPrice: null, StockFlag: null, StockTag: null,
    InspectionCondition: null, Dekra: null,
  };
}

async function searchVehicles(q: string): Promise<WbcVehicle[]> {
  const out: WbcVehicle[] = [];
  let to = 0;
  let total = Infinity;
  while (to < total) {
    // Re-resolve each page — the PoW token only lives ~60s and pagination can outlast it
    const token = await getPowToken();
    const res = await fetch(`${GATEWAY}/website-elastic-backend/api/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
        'x-proof-of-work-token': token,
        'x-calling-service': 'WeBuyCars Website',
        'Origin': BASE,
        'Referer': `${BASE}/`,
      },
      body: JSON.stringify(searchBody(q, to)),
    });
    if (!res.ok) {
      console.error(`[wbc] search "${q}" at ${to} failed: ${res.status}`);
      break;
    }
    const json = await res.json() as { total?: { value: number }; data?: WbcVehicle[] };
    total = json.total?.value ?? 0;
    const batch = json.data ?? [];
    if (batch.length === 0) break;
    out.push(...batch);
    to += batch.length;
    await new Promise(r => setTimeout(r, 400 + Math.random() * 300));
  }
  return out;
}

interface WbcVehicle {
  Make?: string;
  Model?: string;
  Year?: number;
  Price?: number;
  Mileage?: number;
  Province?: string;
  VehicleStatus?: string;
  Description?: string;
  Colour?: string;
  Transmission?: string; // get-car payloads
  Gearbox?: string;      // search payloads
  StockNumber?: string;
  DealerKey?: string;
  Status?: string;
  FuelType?: string;
  Variant?: string;
  Images?: { other?: string[]; external?: string[] };
}

function isLandCruiser(v: WbcVehicle): boolean {
  if (v.Make !== 'Toyota') return false;
  const model = v.Model ?? '';
  if (/land.?cruiser/i.test(model) || /\bprado\b/i.test(model) || /\bfj.?cruiser\b/i.test(model)) return true;
  // Adjacent Toyota 4x4s — collected for data, gated, never shown on the LC site
  if (collectExtraSegments() && (/\bhilux\b/i.test(model) || /\bfortuner\b/i.test(model))) return true;
  return false;
}

function normalizeWbc(v: WbcVehicle): NormalizedListing {
  const photos: string[] = [
    ...(v.Images?.other ?? []),
    ...(v.Images?.external ?? []),
  ].slice(0, 20);

  const transmissionRaw = (v.Transmission ?? v.Gearbox ?? '').toLowerCase();
  const transmission: 'manual' | 'automatic' = transmissionRaw.includes('manual') ? 'manual' : 'automatic';
  const mileage = Number(v.Mileage ?? 0);
  const title = [v.Year, v.Make, v.Model, v.Variant].filter(Boolean).join(' ');

  return {
    source: SOURCE,
    source_id: v.StockNumber!,
    source_url: `${BASE}/buy-a-car/${v.StockNumber}`,
    title,
    year: Number(v.Year ?? new Date().getFullYear()),
    model: normalizeModel(title, Number(v.Year)),
    price: Number(v.Price ?? 0),
    mileage,
    province: normalizeProvince(v.Province ?? ''),
    new_or_used: mileage > 0 ? 'Used' : 'New',
    transmission,
    colour: v.Colour ?? '',
    description: v.Description ?? '',
    photos,
    seller_name: v.DealerKey ?? 'WeBuyCars',
    fuel_type: v.FuelType ?? undefined,
  };
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

// Search results carry the full vehicle record (Gearbox, Images, Description…),
// so discover() caches normalized listings and fetchListing() reads the cache.
// This matters: the gateway shares one small rate-limit bucket across endpoints
// (~50 req/window) — per-listing get-car calls for 200+ vehicles always 429.
const cache = new Map<string, NormalizedListing>();

export const WbcAdapter: SourceAdapter = {
  source: SOURCE,

  async discover(): Promise<DiscoveredRef[]> {
    cache.clear();
    const refs: DiscoveredRef[] = [];

    for (const q of SEARCH_QUERIES) {
      const vehicles = await searchVehicles(q);
      let matched = 0;
      for (const v of vehicles) {
        if (!isLandCruiser(v) || !v.StockNumber || v.Status !== 'For Sale') continue;
        if (cache.has(v.StockNumber)) continue;
        cache.set(v.StockNumber, normalizeWbc(v));
        matched++;
        refs.push({
          source: SOURCE,
          source_id: v.StockNumber,
          source_url: `${BASE}/buy-a-car/${v.StockNumber}`,
        });
      }
      console.log(`[wbc] "${q}": ${vehicles.length} hits, ${matched} new LC refs`);
    }

    return refs;
  },

  async fetchListing(ref: DiscoveredRef): Promise<NormalizedListing | null> {
    // Populated by discover() — no per-listing API call
    const cached = cache.get(ref.source_id);
    if (cached) return cached;

    // Fallback for callers outside a discover() run (rate-limited: ~50/window)
    let res: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await getPowToken();
      try {
        res = await politeFetch(
          `${GATEWAY}/website-elastic-backend/api/get-car/${ref.source_id.toUpperCase()}`,
          { headers: { 'x-proof-of-work-token': token, 'Accept': 'application/json' } }
        );
      } catch (err) {
        console.error(`[wbc] get-car ${ref.source_id} network error:`, String(err));
        return null;
      }
      if (res.status !== 401 && res.status !== 403) break;
      _powToken = null; // token rejected — force a fresh challenge and retry once
    }
    if (!res?.ok) {
      console.error(`[wbc] get-car ${ref.source_id} failed: ${res?.status}`);
      return null;
    }
    const body = await res.json() as { result?: boolean; data?: WbcVehicle };
    if (!body.result || !body.data) return null;
    const v = body.data;
    if (!isLandCruiser(v)) return null;
    return normalizeWbc(v);
  },

  async isStillLive(ref: DiscoveredRef): Promise<LivenessResult> {
    const res = await fetch(`${BASE}/buy-a-car/${ref.source_id}`, {
      method: 'HEAD',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (res.status === 404) return 'removed';
    if (res.ok) return 'live';
    return 'unknown';
  },
};
