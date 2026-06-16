// A2 bracket test — compare engine variants to fix the 65% in-band result.
// V0 = spec §3 as written.
// V1 = V0 + robust price-outlier trim (IQR fence) on the cohort before stats.
// V2 = V1 + asking ceiling re-anchored to the cohort's own upper quartile
//      (ceiling = clamp(base*(1+w), p75, p90)) instead of median*(1+w).
import Database from 'better-sqlite3';
const db = new Database(process.env.DATABASE_PATH ?? '/tmp/lcsa-prod.sqlite');
const CUR_YEAR = new Date().getFullYear();

const DEPRECIATION_RATE = 0.0000018, MILEAGE_CAP = 0.15, SELL_DISCOUNT = 0.10, NEW_VEHICLE_DISCOUNT = 0.04;
const COND = { excellent:0.03, good:0, fair:-0.05, rough:-0.12 };
const LAUNCH = { 'prado-250':2024, 'land-cruiser-fj':2026, '300-series':2021 };
const TIER_W = { high:0.06, medium:0.09, low:0.13 };
const clamp = (x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const pctl = (s,p)=>{ if(!s.length)return 0; if(s.length===1)return s[0]; const i=p*(s.length-1),lo=Math.floor(i),hi=Math.ceil(i); return lo===hi?s[lo]:s[lo]+(s[hi]-s[lo])*(i-lo); };

const activeRows = db.prepare(`SELECT id,model,year,price,mileage FROM listings WHERE segment='land-cruiser' AND status='active' AND listing_type='for_sale' AND new_or_used='Used' AND price>0`).all();
const cutoff6 = Math.floor(Date.now()/1000)-180*86400;
const delistedRows = db.prepare(`SELECT id,model,year,price,mileage FROM listings WHERE segment='land-cruiser' AND status IN ('removed','sold') AND new_or_used='Used' AND price>0 AND off_market_at IS NOT NULL AND off_market_at>=?`).all(cutoff6);
const grp = r=>{const m=new Map();for(const x of r)(m.get(x.model)??m.set(x.model,[]).get(x.model)).push(x);return m;};
const activeBy=grp(activeRows), delistedBy=grp(delistedRows);

function priceTrim(rows){ // drop price outliers via 1.5*IQR fence; keep >=5 else untrimmed
  const ps=rows.map(r=>r.price).sort((a,b)=>a-b);
  const q1=pctl(ps,0.25),q3=pctl(ps,0.75),iqr=q3-q1,lo=q1-1.5*iqr,hi=q3+1.5*iqr;
  const t=rows.filter(r=>r.price>=lo&&r.price<=hi);
  return t.length>=5?t:rows;
}
function expand(rows,year){ for(let s=1;s<=3;s++){const sub=rows.filter(r=>r.year>=year-s&&r.year<=year+s); if(sub.length>=5)return{sub,span:s};} return null; }
function cohort(model,year,excludeId,trim){
  const d=delistedBy.get(model)??[], a=(activeBy.get(model)??[]).filter(r=>r.id!==excludeId);
  let ch=null,basis=null; const ed=expand(d,year);
  if(ed){ch=ed;basis='delisted';} else {const ea=expand(a,year); if(ea){ch=ea;basis='active';}}
  if(!ch)return null;
  let rows=ch.sub; if(trim)rows=priceTrim(rows);
  const ps=rows.map(r=>r.price).sort((x,y)=>x-y), kms=rows.filter(r=>r.mileage>0).map(r=>r.mileage);
  return { size:rows.length, span:ch.span, basis, median:Math.round(pctl(ps,0.5)),
    p25:pctl(ps,0.25),p75:pctl(ps,0.75),p90:pctl(ps,0.90),
    avgMileage:kms.length>=5?Math.round(kms.reduce((s,k)=>s+k,0)/kms.length):null, kmComp:kms.length,
    minYear:Math.min(...rows.map(r=>r.year)) };
}
function estimate(inp,c,ceilingMode){
  const launch=LAUNCH[inp.model]??0;
  const young=(CUR_YEAR-inp.year)<=2||c.minYear>=CUR_YEAR-2||(launch&&inp.year<=launch+1);
  const d=young?NEW_VEHICLE_DISCOUNT:SELL_DISCOUNT;
  let M=0,madj=false;
  if(!young&&c.avgMileage!==null&&c.kmComp>=5&&inp.mileage>0){ M=clamp(c.median*DEPRECIATION_RATE*(c.avgMileage-inp.mileage),-MILEAGE_CAP*c.median,MILEAGE_CAP*c.median); madj=true; }
  const base=c.median+M;
  let tier=c.size>=12?'high':c.size>=8?'medium':'low';
  const dg=(c.basis==='active')||(c.span===3)||!madj||(c.kmComp<5)||young;
  if(dg)tier=tier==='high'?'medium':'low';
  let w=Math.max(TIER_W[tier],0.5*(c.p75-c.p25)/c.median);
  const sellMid=base*(1-d); let sellLow=Math.max(sellMid*(1-w),c.p25*(1-d));
  const cf=1+COND[inp.condition??'good']; const cb=base*cf;
  const ceiling = ceilingMode==='p75' ? clamp(cb*(1+w),c.p75,c.p90) : Math.min(cb*(1+w),c.p90);
  return { sellLow, sellMid, askingCeiling:ceiling };
}

function run(trim,ceilingMode){
  let below=0,inb=0,above=0,none=0,n=0;
  for(const L of activeRows){ n++;
    const c=cohort(L.model,L.year,L.id,trim); if(!c){none++;continue;}
    const e=estimate({model:L.model,year:L.year,mileage:L.mileage,condition:'good'},c,ceilingMode);
    if(L.price<e.sellLow)below++; else if(L.price>e.askingCeiling)above++; else inb++;
  }
  const den=n-none; return {below,inb,above,none,n,inPct:Math.round(inb/den*100),belowPct:Math.round(below/den*100),abovePct:Math.round(above/den*100)};
}

const V0=run(false,'spec'), V1=run(true,'spec'), V2=run(true,'p75');
console.log('\nVARIANT COMPARISON (2137 active listings, self-excluded)\n');
console.log('variant                          BELOW   IN-BAND  ABOVE   in%');
console.log('-'.repeat(64));
const row=(name,r)=>console.log(`${name.padEnd(32)} ${(r.belowPct+'%').padStart(5)}   ${(r.inPct+'%').padStart(6)}  ${(r.abovePct+'%').padStart(5)}   ${r.inPct}`);
row('V0  spec as-written', V0);
row('V1  + price-outlier trim', V1);
row('V2  + trim + p75-anchored ceiling', V2);
console.log('-'.repeat(64));

// per-model under the winning variant (V2)
console.log('\nPER-MODEL under V2 (trim + p75 ceiling):');
console.log('model            n     in%   below%  above%');
console.log('-'.repeat(50));
const MODELS=['79-series','prado-150','300-series','prado-250','200-series','76-series','fj-cruiser','100-series','70-series','land-cruiser-fj','80-series','78-series'];
for(const model of MODELS){
  const rows=activeRows.filter(r=>r.model===model); if(!rows.length)continue;
  let below=0,inb=0,above=0,none=0;
  for(const L of rows){ const c=cohort(L.model,L.year,L.id,true); if(!c){none++;continue;}
    const e=estimate({model:L.model,year:L.year,mileage:L.mileage,condition:'good'},c,'p75');
    if(L.price<e.sellLow)below++; else if(L.price>e.askingCeiling)above++; else inb++; }
  const den=rows.length-none; const ip=den?Math.round(inb/den*100):0;
  console.log(`${model.padEnd(16)} ${String(rows.length).padStart(4)}  ${(ip+'%').padStart(5)}  ${(den?Math.round(below/den*100):0+'%').toString().padStart(5)}%  ${(den?Math.round(above/den*100):0+'%').toString().padStart(5)}%`);
}
db.close();
