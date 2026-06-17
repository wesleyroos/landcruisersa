// Validate spec.ts extraction against live listing titles: per model+axis,
// how many titles parse (coverage) and the median price per spec value (sanity).
import Database from 'better-sqlite3';
import { SPEC_OPTIONS, parseAxis, axesFor, type SpecAxis } from '../src/lib/spec.ts';

const db = new Database(process.env.DATABASE_PATH ?? '/tmp/lcsa-prod.sqlite');
const med = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const R = (n: number) => 'R' + Math.round(n / 1000) + 'k';

for (const model of Object.keys(SPEC_OPTIONS)) {
  const rows = db.prepare(
    "SELECT title, price FROM listings WHERE segment='land-cruiser' AND status='active' AND model=? AND price>0"
  ).all(model) as { title: string; price: number }[];
  console.log(`\n===== ${model} (n=${rows.length}) =====`);
  for (const axis of axesFor(model)) {
    const buckets = new Map<string, number[]>();
    let unparsed = 0;
    for (const r of rows) {
      const v = parseAxis(model, axis, r.title);
      if (v === null) { unparsed++; continue; }
      (buckets.get(v) ?? buckets.set(v, []).get(v)!).push(r.price);
    }
    const cov = Math.round((rows.length - unparsed) / rows.length * 100);
    console.log(`  ${axis} — ${cov}% parsed (${unparsed} unknown):`);
    for (const o of SPEC_OPTIONS[model]![axis]!) {
      const b = buckets.get(o.value) ?? [];
      if (b.length) console.log(`     ${o.label.padEnd(18)} n=${String(b.length).padStart(3)}  median ${R(med(b))}`);
    }
  }
}
db.close();
