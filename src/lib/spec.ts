// Vehicle spec extracted from listing titles, so the valuation engine can value
// by trim/engine/body — not just model+year. Validated against live data: within
// a model+year the spec dwarfs every other factor (Prado VX-L vs VX ≈ 100%
// price gap; 200 VX-R vs VX ≈ 70%; 300 GR-Sport vs GX-R ≈ 32%). We have no spec
// columns, so we parse the free-text title (the only place it lives) on the fly.

export type SpecAxis = 'engine' | 'grade' | 'body';

export interface SpecOption {
  value: string;   // stable key
  label: string;   // picker label
  re: RegExp;      // title matcher
}

// Per model, only the axes that actually move price. Options are ordered MOST
// SPECIFIC FIRST (e.g. VX-L before VX, GR-Sport before GX-R) — parse() returns
// the first match, so a "VX-L" title is never mis-read as "VX". Models not listed
// (78-series, fj-cruiser) have one dominant SA spec → model+year only.
export const SPEC_OPTIONS: Record<string, Partial<Record<SpecAxis, SpecOption[]>>> = {
  '79-series': {
    engine: [
      { value: 'v8',     label: '4.5 V8 diesel',   re: /4\.?5|v8/i },
      { value: 'gd6',    label: '2.8 GD-6 diesel', re: /2\.?8|gd[\s-]?6/i },
      { value: '4.2d',   label: '4.2 diesel',      re: /4\.?2/i },
      { value: 'petrol', label: '4.0 V6 petrol',   re: /4\.?0|\bv6\b/i },
    ],
    body: [
      { value: 'double', label: 'Double Cab', re: /double[\s-]?cab|\bd[\s\/]?cab\b/i },
      { value: 'single', label: 'Single Cab', re: /single[\s-]?cab|\bs[\s\/]?cab\b/i },
    ],
  },
  '76-series': {
    engine: [
      { value: 'v8',   label: '4.5 V8 diesel',   re: /4\.?5|v8/i },
      { value: 'gd6',  label: '2.8 GD-6 diesel', re: /2\.?8|gd[\s-]?6/i },
      { value: '4.2d', label: '4.2 diesel',      re: /4\.?2/i },
    ],
  },
  '80-series': {
    // Fuel/engine is the dominant price driver: a 4.5 petrol GX manual sits far
    // below a same-year turbo-diesel VX auto. Turbo diesel before NA diesel so a
    // "4.2 TD" is never read as a plain "4.2 D".
    engine: [
      { value: 'td',     label: '4.2 turbo diesel', re: /1hd|4\.?2\s*t|\btd\b|turbo|tdi/i },
      { value: 'nad',    label: '4.2 NA diesel',    re: /4\.?2|1hz|diesel/i },
      { value: 'petrol', label: '4.5 petrol',       re: /4\.?5|1fz|petrol/i },
    ],
    grade: [
      { value: 'vx', label: 'VX', re: /\bvx\b/i },
      { value: 'gx', label: 'GX', re: /\bgx\b/i },
    ],
  },
  '100-series': {
    // The code folds the 105 (solid-axle workhorse) into 100-series, so engine is
    // the only honest way to separate the cohorts: 1HD-FTE turbo diesel & 4.7 V8
    // = the IFS "100" (VX); 1HZ NA diesel & 4.5 petrol = the solid-axle "105" (GX).
    engine: [
      { value: 'td',     label: '4.2 turbo diesel (100)', re: /1hd|4\.?2\s*t|\btd\b|turbo|tdi/i },
      { value: 'v8',     label: '4.7 V8 petrol (100)',    re: /4\.?7|v8/i },
      { value: 'petrol', label: '4.5 petrol (105)',       re: /4\.?5|4500|1fz|efi/i },
      { value: 'nad',    label: '4.2 NA diesel (105)',    re: /4\.?2|1hz/i },
    ],
  },
  // 78-series omitted: the SA 78 is a single 4.2 1HZ diesel, one grade, one body —
  // nothing to disambiguate, so model+year already handles it honestly.
  '200-series': {
    grade: [
      { value: 'vxr', label: 'VX-R', re: /vx[\s-]?r/i },
      { value: 'vx',  label: 'VX',   re: /\bvx\b/i },
      { value: 'gx',  label: 'GX / GX-R', re: /\bgx\b/i },
    ],
  },
  '300-series': {
    // SA range is GX-R / ZX / GR-Sport ONLY — no "VX" here (that's an Aus/global
    // grade). Petrol (3.5 V6) was sold only on ZX/GR-Sport; GX-R is diesel-only.
    grade: [
      { value: 'grs', label: 'GR-Sport', re: /gr[\s-]?s(port)?/i },
      { value: 'zx',  label: 'ZX',       re: /\bzx\b/i },
      { value: 'gxr', label: 'GX-R',     re: /gx[\s-]?r/i },
    ],
    engine: [
      { value: 'diesel', label: '3.3 V6 diesel', re: /3\.?3|diesel/i },
      { value: 'petrol', label: '3.5 V6 petrol', re: /3\.?5|petrol/i },
    ],
  },
  'prado-150': {
    grade: [
      { value: 'vxl', label: 'VX-L', re: /vx[\s-]?l/i },
      { value: 'vx',  label: 'VX',   re: /\bvx\b/i },
      { value: 'tx',  label: 'TX',   re: /\btx\b/i },
    ],
    engine: [
      { value: 'gd',     label: '2.8 GD-6 (2020+)',    re: /2\.?8|\bgd\b/i },
      { value: '3.0d',   label: '3.0 D-4D (pre-2021)', re: /3\.?0|tdi|\bdt\b/i },
      { value: 'petrol', label: '4.0 V6 petrol',       re: /4\.?0|\bv6\b/i },
    ],
  },
  'prado-250': {
    // SA range is TX / VX-R / VX-L (+ the 2024 launch-only First Edition). NO
    // GR-Sport — it was never sold in SA. VX-R is the core volume grade.
    grade: [
      { value: 'fe',  label: 'First Edition (2024)', re: /first[\s-]?edition|\bfe\b/i },
      { value: 'vxl', label: 'VX-L',                 re: /vx[\s-]?l/i },
      { value: 'vxr', label: 'VX-R',                 re: /vx[\s-]?r/i },
      { value: 'tx',  label: 'TX',                    re: /\btx\b/i },
    ],
  },
  'land-cruiser-fj': {
    // Two SA grades: GX (R714k) and VX (R761k, +ADAS/leather). One engine, one
    // body. Data-gated, so it stays dormant until used GX/VX listings accumulate.
    grade: [
      { value: 'vx', label: 'VX', re: /\bvx\b/i },
      { value: 'gx', label: 'GX', re: /\bgx\b/i },
    ],
  },
};

// First matching option value for an axis, or null if unknown / model has no axis.
export function parseAxis(model: string, axis: SpecAxis, title: string): string | null {
  const opts = SPEC_OPTIONS[model]?.[axis];
  if (!opts) return null;
  for (const o of opts) if (o.re.test(title)) return o.value;
  return null;
}

export function axesFor(model: string): SpecAxis[] {
  return Object.keys(SPEC_OPTIONS[model] ?? {}) as SpecAxis[];
}

// Is `value` a real option for this model+axis? Used to sanitise API input.
export function isSpecValue(model: string, axis: SpecAxis, value: string): boolean {
  return !!SPEC_OPTIONS[model]?.[axis]?.some(o => o.value === value);
}

export interface SpecSelection { engine?: string; grade?: string; body?: string }

// Does a comp's title match the selected spec on the given axes? A comp whose
// axis we can't parse is treated as NON-matching for the strict cohort (we won't
// guess), but it's still available once that axis is relaxed away.
export function titleMatches(model: string, title: string, sel: SpecSelection, axes: SpecAxis[]): boolean {
  for (const axis of axes) {
    const want = sel[axis];
    if (!want) continue;
    if (parseAxis(model, axis, title) !== want) return false;
  }
  return true;
}

// Human label for a spec selection, e.g. "VX-L 2.8 GD" or "Double Cab 4.5 V8 diesel".
export function specLabel(model: string, sel: SpecSelection): string {
  const order: SpecAxis[] = ['grade', 'engine', 'body'];
  const parts: string[] = [];
  for (const axis of order) {
    const want = sel[axis];
    if (!want) continue;
    const opt = SPEC_OPTIONS[model]?.[axis]?.find(o => o.value === want);
    if (opt) parts.push(opt.label);
  }
  return parts.join(' ');
}
