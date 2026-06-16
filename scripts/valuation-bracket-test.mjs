// A2 bracket test (spec §10) — faithful port of §3 estimateValue + getCohortStats.
// For every active Used LC listing, compute the range we'd quote for its own
// (model, year, mileage) WITH ITSELF EXCLUDED, then check where its real asking
// price lands: BELOW floor (cheap/good deal), IN band, or ABOVE ceiling (overpriced).
// A healthy engine: most listings IN; the cheapest fall BELOW; the dearest ABOVE
// (~10% above is expected by construction, since the ceiling clamps to p90).
import Database from 'better-sqlite3';

const db = new Database(process.env.DATABASE_PATH ?? '/tmp/lcsa-prod.sqlite');
const CUR_YEAR = new Date().getFullYear();

// ---- constants (verbatim from spec §3) ----
const DEPRECIATION_RATE = 0.0000018;     // fraction of value per km
const MILEAGE_CAP = 0.15;
const SELL_DISCOUNT = 0.10;
const NEW_VEHICLE_DISCOUNT = 0.04;
const COND_FACTOR = { excellent: 0.03, good: 0, fair: -0.05, rough: -0.12 };
const MODEL_LAUNCH_YEAR = { 'prado-250': 2024, 'land-cruiser-fj': 2026, '300-series': 2021 };
const TIER_W = { high: 0.06, medium: 0.09, low: 0.13 };

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
function pctl(sorted, p) {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1), lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ---- load pools once ----
const activeRows = db.prepare(`SELECT id, model, year, price, mileage FROM listings
  WHERE segment='land-cruiser' AND status='active' AND listing_type='for_sale'
    AND new_or_used='Used' AND price>0`).all();
const cutoff6 = Math.floor(Date.now()/1000) - 180*86400;
const delistedRows = db.prepare(`SELECT id, model, year, price, mileage FROM listings
  WHERE segment='land-cruiser' AND status IN ('removed','sold')
    AND new_or_used='Used' AND price>0 AND off_market_at IS NOT NULL AND off_market_at>=?`).all(cutoff6);

const group = (rows) => { const m = new Map(); for (const r of rows){ (m.get(r.model)??m.set(r.model,[]).get(r.model)).push(r);} return m; };
const activeBy = group(activeRows), delistedBy = group(delistedRows);
const supplyBy = new Map(); for (const r of activeRows) supplyBy.set(r.model, (supplyBy.get(r.model)??0)+1);

// ---- getCohortStats (delisted-preferred -> active fallback) ----
function expand(rows, year) {
  for (let span = 1; span <= 3; span++) {
    const sub = rows.filter(r => r.year >= year-span && r.year <= year+span);
    if (sub.length >= 5) return { sub, span };
  }
  return null;
}
function getCohortStats(model, year, excludeId) {
  const d = (delistedBy.get(model) ?? []);
  const a = (activeBy.get(model) ?? []).filter(r => r.id !== excludeId);
  let chosen = null, anchorBasis = null;
  const ed = expand(d, year);
  if (ed) { chosen = ed; anchorBasis = 'delisted'; }
  else { const ea = expand(a, year); if (ea) { chosen = ea; anchorBasis = 'active'; } }
  if (!chosen) return null;
  const rows = chosen.sub;
  const prices = rows.map(r => r.price).sort((x,y)=>x-y);
  const kms = rows.filter(r => r.mileage > 0).map(r => r.mileage);
  return {
    cohortSize: rows.length, span: chosen.span, anchorBasis,
    medianPrice: Math.round(pctl(prices, 0.5)),
    p25: pctl(prices, 0.25), p75: pctl(prices, 0.75), p90: pctl(prices, 0.90),
    avgMileage: kms.length >= 5 ? Math.round(kms.reduce((s,k)=>s+k,0)/kms.length) : null,
    kmCompCount: kms.length,
    cohortMinYear: Math.min(...rows.map(r=>r.year)),
    modelSupply: supplyBy.get(model) ?? 0,
  };
}

// ---- estimateValue (condition='good', no extras: isolates the core engine) ----
function estimateValue(input, c) {
  const { year, mileage } = input;
  const launch = MODEL_LAUNCH_YEAR[input.model] ?? 0;
  const isYoung = (CUR_YEAR - year) <= 2 || c.cohortMinYear >= CUR_YEAR - 2 || (launch && year <= launch + 1);
  const d = isYoung ? NEW_VEHICLE_DISCOUNT : SELL_DISCOUNT;

  let M = 0, mileageAdjusted = false;
  if (!isYoung && c.avgMileage !== null && c.kmCompCount >= 5 && mileage > 0) {
    M = c.medianPrice * DEPRECIATION_RATE * (c.avgMileage - mileage);
    M = clamp(M, -MILEAGE_CAP * c.medianPrice, MILEAGE_CAP * c.medianPrice);
    mileageAdjusted = true;
  }
  const base = c.medianPrice + M;

  // confidence tier from size, then downgrade one step (floored at 'low')
  let tier = c.cohortSize >= 12 ? 'high' : c.cohortSize >= 8 ? 'medium' : 'low';
  const downgrades = [];
  if (c.anchorBasis === 'active') downgrades.push('active-anchor');
  if (c.span === 3) downgrades.push('wide-span');
  if (!mileageAdjusted) downgrades.push('no-mileage');
  if (c.kmCompCount < 5) downgrades.push('few-km-comps');
  if (isYoung) downgrades.push('young-cohort');
  if (downgrades.length) tier = tier === 'high' ? 'medium' : 'low';
  let w = TIER_W[tier];
  w = Math.max(w, 0.5 * (c.p75 - c.p25) / c.medianPrice);   // IQR floor

  const sellMid = base * (1 - d);
  let sellLow = sellMid * (1 - w);
  const sellHigh = sellMid * (1 + w);
  sellLow = Math.max(sellLow, c.p25 * (1 - d));               // compound floor

  const condFactor = 1 + COND_FACTOR[input.condition ?? 'good'];
  const ceilingBase = base * condFactor; // + E (0 in test)
  const askingCeiling = Math.min(ceilingBase * (1 + w), c.p90);

  return { sellLow, sellMid, sellHigh, askingCeiling, confidence: tier, w, d, M, mileageAdjusted, isYoung, downgrades };
}

// ---- run across all active listings ----
const MODELS = ['79-series','prado-150','300-series','prado-250','200-series','76-series','fj-cruiser','100-series','70-series','land-cruiser-fj','80-series','78-series'];
const perModel = new Map();
const all = [];
for (const L of activeRows) {
  const c = getCohortStats(L.model, L.year, L.id);
  if (!c) { const m = perModel.get(L.model) ?? {below:0,inb:0,above:0,none:0,n:0}; m.none++; m.n++; perModel.set(L.model,m); continue; }
  const e = estimateValue({ model: L.model, year: L.year, mileage: L.mileage, condition: 'good' }, c);
  const cls = L.price < e.sellLow ? 'below' : L.price > e.askingCeiling ? 'above' : 'inb';
  const m = perModel.get(L.model) ?? {below:0,inb:0,above:0,none:0,n:0};
  m[cls]++; m.n++; perModel.set(L.model, m);
  all.push({ ...L, c, e, cls });
}

console.log(`\nA2 BRACKET TEST — ${activeRows.length} active Used LC listings, self-excluded\n`);
console.log('model            n    BELOW   IN-BAND  ABOVE   no-data   in%   anchor');
console.log('-'.repeat(78));
let tot={below:0,inb:0,above:0,none:0,n:0};
for (const model of MODELS) {
  const m = perModel.get(model); if (!m) continue;
  for (const k of ['below','inb','above','none','n']) tot[k]+=m[k];
  const inPct = m.n-m.none>0 ? Math.round(m.inb/(m.n-m.none)*100) : 0;
  const sample = all.find(x=>x.model===model);
  const anchor = sample ? sample.c.anchorBasis : '—';
  console.log(`${model.padEnd(16)} ${String(m.n).padStart(4)}  ${String(m.below).padStart(5)}  ${String(m.inb).padStart(7)}  ${String(m.above).padStart(5)}  ${String(m.none).padStart(6)}   ${(inPct+'%').padStart(4)}  ${anchor}`);
}
console.log('-'.repeat(78));
const denom = tot.n - tot.none;
console.log(`TOTAL            ${String(tot.n).padStart(4)}  ${String(tot.below).padStart(5)}  ${String(tot.inb).padStart(7)}  ${String(tot.above).padStart(5)}  ${String(tot.none).padStart(6)}   ${(Math.round(tot.inb/denom*100)+'%').padStart(4)}`);
console.log(`\nBELOW = priced under our realistic-sell floor (cheap / good deal)`);
console.log(`ABOVE = priced over our p90-clamped asking ceiling (overpriced) — ~10% expected by design`);

// ---- gradient spot-check on the flagship 79-series: cheapest / median / dearest ----
console.log(`\n=== 79-series gradient check (does cheap->floor, dear->ceiling hold?) ===`);
const s79 = all.filter(x=>x.model==='79-series').sort((a,b)=>a.price-b.price);
const pick = [s79[0], s79[Math.floor(s79.length/2)], s79[s79.length-1]];
const zar = n => 'R'+Math.round(n/1000)+'k';
for (const p of pick) {
  const relMed = Math.round((p.price - p.c.medianPrice)/p.c.medianPrice*100);
  const pos = ((p.price - p.e.sellLow)/(p.e.askingCeiling - p.e.sellLow)*100);
  console.log(`${p.year} ${p.mileage.toLocaleString()}km  asking ${zar(p.price)}  | cohort med ${zar(p.c.medianPrice)} (${relMed>=0?'+':''}${relMed}%)  | range ${zar(p.e.sellLow)}–${zar(p.e.askingCeiling)} (mid ${zar(p.e.sellMid)})  | ${p.cls.toUpperCase()} pos=${Math.round(pos)}%  conf=${p.e.confidence}`);
}

// ---- worked single example to eyeball full internals ----
console.log(`\n=== full internals, one mid 79-series ===`);
const mid = pick[1];
console.log(JSON.stringify({ input:{model:mid.model,year:mid.year,mileage:mid.mileage}, cohort:mid.c, estimate:mid.e }, (k,v)=>typeof v==='number'?Math.round(v):v, 2));
db.close();
