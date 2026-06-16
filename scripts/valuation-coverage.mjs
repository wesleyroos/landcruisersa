// Valuation tool coverage pre-flight (spec §10 "A2" precursor).
// Mirrors getCohortStats: per (model, year), expand ±1→±3 over the
// delisted pool first, then the active pool; "covered" = a pool reaches >=5.
// Reports, per model, the share of REAL listing inputs that would yield a
// number vs "insufficient data", so we know how viable the tool is before building.
import Database from 'better-sqlite3';
import { resolve } from 'path';

// open read-write (no readonly) so an uncheckpointed WAL is replayed on open
const db = new Database(process.env.DATABASE_PATH ?? resolve(process.cwd(), 'db.sqlite'));

const LC_MODELS = ['70-series','76-series','78-series','79-series','80-series','100-series',
  '200-series','300-series','prado-150','prado-250','fj-cruiser','land-cruiser-fj'];

// detect timestamp scale (drizzle 'timestamp' mode = seconds)
const maxTs = db.prepare(`SELECT MAX(created_at) m FROM listings`).get().m ?? 0;
const isMs = maxTs > 1e12;
const nowSec = Math.floor(Date.now() / 1000);
const cutoff6mo = (isMs ? nowSec * 1000 : nowSec) - (isMs ? 180 * 86400 * 1000 : 180 * 86400);

const active = db.prepare(`
  SELECT model, year, price FROM listings
  WHERE segment='land-cruiser' AND status='active' AND listing_type='for_sale'
    AND new_or_used='Used' AND price > 0`).all();

const delisted = db.prepare(`
  SELECT model, year, price, off_market_at FROM listings
  WHERE segment='land-cruiser' AND status IN ('sold','removed')
    AND new_or_used='Used' AND price > 0 AND off_market_at IS NOT NULL
    AND off_market_at >= ?`).all(cutoff6mo);

function byModel(rows) {
  const m = new Map();
  for (const r of rows) { if (!m.has(r.model)) m.set(r.model, []); m.get(r.model).push(r); }
  return m;
}
const activeBy = byModel(active);
const delistedBy = byModel(delisted);

function median(ns) { const s = [...ns].sort((a,b)=>a-b); const n = s.length;
  return n ? (n%2 ? s[(n-1)/2] : Math.round((s[n/2-1]+s[n/2])/2)) : 0; }

function cohortN(rows, year) {
  for (let span=1; span<=3; span++) {
    const n = rows.filter(r => r.year >= year-span && r.year <= year+span).length;
    if (n >= 5) return { n, span };
  }
  return { n: rows.filter(r => r.year >= year-3 && r.year <= year+3).length, span: 3 };
}

console.log(`\nDB ts scale: ${isMs?'ms':'sec'}  |  6mo-delisted cutoff applied`);
console.log(`Total Used for-sale active LC (price>0): ${active.length}`);
console.log(`Total Used delisted-6mo LC (price>0):    ${delisted.length}\n`);
console.log('model            active  delist  yrs(min-max)  medPrice   covered%  basis        verdict');
console.log('-'.repeat(96));

let totalListings = 0, totalCovered = 0;
const summary = [];

for (const model of LC_MODELS) {
  const a = activeBy.get(model) ?? [];
  const d = delistedBy.get(model) ?? [];
  const all = [...a, ...d];
  if (all.length === 0) {
    console.log(`${model.padEnd(16)} ${'0'.padStart(6)}  ${'0'.padStart(6)}  ${'—'.padStart(12)}  ${'—'.padStart(8)}   ${'—'.padStart(7)}  ${''.padEnd(11)}  NO DATA`);
    summary.push({ model, verdict: 'NO DATA', covered: 0, n: 0 });
    continue;
  }
  const years = all.map(r => r.year);
  const yMin = Math.min(...years), yMax = Math.max(...years);
  const medP = median(all.map(r => r.price));

  // For each listing (proxy for an owner input at that model/year), is its cohort >=5?
  let covered = 0, delistedBasis = 0;
  for (const r of all) {
    const dc = cohortN(d, r.year);
    const ac = cohortN(a, r.year);
    if (dc.n >= 5) { covered++; delistedBasis++; }
    else if (ac.n >= 5) { covered++; }
  }
  const pct = Math.round(covered / all.length * 100);
  const basis = delistedBasis > 0 ? `${Math.round(delistedBasis/Math.max(covered,1)*100)}% delisted` : 'active only';
  const verdict = pct >= 80 ? 'SOLID' : pct >= 40 ? 'PARTIAL' : pct > 0 ? 'SPARSE' : 'DEAD';

  totalListings += all.length; totalCovered += covered;
  summary.push({ model, verdict, covered: pct, n: all.length });
  console.log(`${model.padEnd(16)} ${String(a.length).padStart(6)}  ${String(d.length).padStart(6)}  ${`${yMin}-${yMax}`.padStart(12)}  ${('R'+(medP/1000).toFixed(0)+'k').padStart(8)}   ${(pct+'%').padStart(7)}  ${basis.padEnd(11)}  ${verdict}`);
}

console.log('-'.repeat(96));
const overall = totalListings ? Math.round(totalCovered/totalListings*100) : 0;
console.log(`\nOVERALL input coverage: ${overall}% of real listings sit in a (model,year) that clears >=5 comps`);
const solid = summary.filter(s=>s.verdict==='SOLID').map(s=>s.model);
const partial = summary.filter(s=>s.verdict==='PARTIAL').map(s=>s.model);
const weak = summary.filter(s=>['SPARSE','DEAD','NO DATA'].includes(s.verdict)).map(s=>s.model);
console.log(`SOLID (>=80%):   ${solid.join(', ') || '—'}`);
console.log(`PARTIAL (40-79%):${partial.join(', ') || '—'}`);
console.log(`WEAK (<40%):     ${weak.join(', ') || '—'}\n`);
db.close();
