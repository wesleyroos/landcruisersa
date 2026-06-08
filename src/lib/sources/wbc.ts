import { createHash } from 'crypto';
import { normalizeModel, normalizeProvince } from './normalize.ts';
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
  _powExpiry = Date.now() + 10 * 60 * 1000; // treat as valid for 10 min
  return token;
}

// ─── Sitemap-based discovery ─────────────────────────────────────────────────

async function fetchSitemapIds(): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 1; i <= 9; i++) {
    const res = await fetch(`${BASE}/sitemap-listings-${i}.xml`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) break;
    const xml = await res.text();
    const matches = xml.matchAll(/<loc>https:\/\/www\.webuycars\.co\.za\/buy-a-car\/([^<]+)<\/loc>/g);
    for (const m of matches) {
      const id = m[1].trim();
      if (id) ids.push(id);
    }
  }
  return ids;
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
  Transmission?: string;
  StockNumber?: string;
  DealerKey?: string;
  Status?: string;
  FuelType?: string;
  Variant?: string;
  Images?: { other?: string[]; external?: string[] };
}

async function batchGetVehicles(ids: string[]): Promise<WbcVehicle[]> {
  const res = await fetch(`${GATEWAY}/website-elastic-backend/api/get-vehicles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: JSON.stringify({ stockNumbers: ids }),
  });
  if (!res.ok) return [];
  return await res.json() as WbcVehicle[];
}

function isLandCruiser(v: WbcVehicle): boolean {
  if (v.Make !== 'Toyota') return false;
  const model = v.Model ?? '';
  return /land.?cruiser/i.test(model) || /\bprado\b/i.test(model) || /\bfj.?cruiser\b/i.test(model);
}

function normalizeWbc(v: WbcVehicle): NormalizedListing {
  const photos: string[] = [
    ...(v.Images?.other ?? []),
    ...(v.Images?.external ?? []),
  ].slice(0, 20);

  const transmissionRaw = (v.Transmission ?? '').toLowerCase();
  const transmission: 'manual' | 'automatic' = transmissionRaw.includes('auto') ? 'automatic' : 'manual';
  const mileage = Number(v.Mileage ?? 0);
  const title = [v.Year, v.Make, v.Model, v.Variant].filter(Boolean).join(' ');

  return {
    source: SOURCE,
    source_id: v.StockNumber!,
    source_url: `${BASE}/buy-a-car/${v.StockNumber}`,
    title,
    model: normalizeModel(title),
    year: Number(v.Year ?? new Date().getFullYear()),
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

export const WbcAdapter: SourceAdapter = {
  source: SOURCE,

  async discover(): Promise<DiscoveredRef[]> {
    const allIds = await fetchSitemapIds();
    const refs: DiscoveredRef[] = [];
    const BATCH = 100;

    for (let i = 0; i < allIds.length; i += BATCH) {
      const batch = allIds.slice(i, i + BATCH);
      const vehicles = await batchGetVehicles(batch);
      for (const v of vehicles) {
        if (!isLandCruiser(v) || !v.StockNumber || v.Status !== 'For Sale') continue;
        refs.push({
          source: SOURCE,
          source_id: v.StockNumber,
          source_url: `${BASE}/buy-a-car/${v.StockNumber}`,
        });
      }
      await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
    }

    return refs;
  },

  async fetchListing(ref: DiscoveredRef): Promise<NormalizedListing | null> {
    const token = await getPowToken();
    const res = await fetch(
      `${GATEWAY}/website-elastic-backend/api/get-car/${ref.source_id.toUpperCase()}`,
      { headers: { 'x-proof-of-work-token': token, 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' } }
    );
    if (!res.ok) return null;
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
