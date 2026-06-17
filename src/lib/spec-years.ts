import { db } from '@/db/index';
import { listings } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { SPEC_OPTIONS, parseAxis, axesFor } from '@/lib/spec';

// For each model + axis + spec value, the [minYear, maxYear] observed across all
// listings. Lets the picker hide era-wrong options (a 2.8 GD-6 79 only appears
// from 2024, so it won't show for a 2009) WITHOUT hardcoding eras — fully
// data-driven, so it self-corrects as the market changes.
//
// Memoised per process: spec availability is structural and stable within a
// deploy, and the server restarts on every deploy, so the cache is always fresh
// enough. ~one cheap title-parse pass per model on first /valuation/ render.
export type SpecYearRanges = Record<string, Record<string, Record<string, [number, number]>>>;

let cache: SpecYearRanges | null = null;

export function getSpecYearRanges(): SpecYearRanges {
  if (cache) return cache;
  const out: SpecYearRanges = {};
  for (const model of Object.keys(SPEC_OPTIONS)) {
    // All statuses (active + sold + removed) for the widest, most stable year
    // coverage per spec value; for-sale only (show_off titles are unreliable).
    const rows = db.select({ title: listings.title, year: listings.year })
      .from(listings)
      .where(and(eq(listings.model, model), eq(listings.listing_type, 'for_sale')))
      .all();
    out[model] = {};
    for (const axis of axesFor(model)) {
      const ranges: Record<string, [number, number]> = {};
      for (const r of rows) {
        if (!r.year) continue;
        const v = parseAxis(model, axis, r.title);
        if (!v) continue;
        const cur = ranges[v];
        if (!cur) ranges[v] = [r.year, r.year];
        else { if (r.year < cur[0]) cur[0] = r.year; if (r.year > cur[1]) cur[1] = r.year; }
      }
      out[model][axis] = ranges;
    }
  }
  cache = out;
  return out;
}
