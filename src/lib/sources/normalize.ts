const MODEL_MAP: [RegExp, string][] = [
  // Prado must come first — "Land Cruiser Prado" contains "Land Cruiser" which
  // would otherwise fall through to a numbered-series pattern if variant text
  // contains a series number (e.g. "70th Anniversary Edition").
  [/prado.?250|250[\s-]?series/i,                    'prado-250'],
  [/prado.?150|150[\s-]?series|prado/i,              'prado-150'],
  // AutoTrader uses "70 Series 76 / 78 / 79" — must resolve before the generic 70-series catch-all
  [/70[\s-]?series\s+79\b/i,                         '79-series'],
  [/70[\s-]?series\s+78\b/i,                         '78-series'],
  [/70[\s-]?series\s+76\b/i,                         '76-series'],
  [/79[\s-]?series|lc79|land.?cruiser.?79/i,         '79-series'],
  [/76[\s-]?series|lc76|land.?cruiser.?76/i,         '76-series'],
  [/78[\s-]?series|lc78|land.?cruiser.?78|troopcarrier|troop.?carrier/i, '78-series'],
  [/70[\s-]?series|lc70|land.?cruiser.?70/i,         '70-series'],
  [/300[\s-]?series|lc300|land.?cruiser.?300/i,      '300-series'],
  [/200[\s-]?series|lc200|land.?cruiser.?200/i,      '200-series'],
  [/10[05][\s-]?series|lc10[05]|land.?cruiser.?10[05]/i, '100-series'], // 105 = solid-axle 100
  [/80[\s-]?series|lc80|land.?cruiser.?80/i,         '80-series'],
  [/land.?cruiser.?fj(?!\s*cruiser)/i,               'land-cruiser-fj'],
  [/fj[\s-]?cruiser/i,                               'fj-cruiser'],
  // ── Adjacent Toyota 4x4s (collected into the DB; NOT surfaced on the LC site) ──
  // Listed after every Land Cruiser pattern so LC always wins the match.
  [/\bfortuner\b/i,                                  'fortuner'],
  [/\bhilux\b/i,                                     'hilux'],
];

// Adjacent Toyota-4x4 segment — collected for data and shown on the public
// market pages, but kept out of the LC classifieds. Drives the `segment` column.
export const LC_SEGMENT = 'land-cruiser';
export function segmentForModel(model: string): string {
  return (model.startsWith('hilux') || model.startsWith('fortuner')) ? 'toyota-4x4' : LC_SEGMENT;
}

// Hilux & Fortuner split by engine era (mirrors prado-150/250): the GD-6
// generation launched 2016, replacing the D-4D. Engine name in the title wins;
// otherwise fall back to the model year.
function hiluxFortunerEra(raw: string, year?: number): 'gd6' | 'd4d' {
  if (/d[\s-]?4d/i.test(raw)) return 'd4d';
  if (/gd[\s-]?6/i.test(raw)) return 'gd6';
  return (year ?? 2016) >= 2016 ? 'gd6' : 'd4d';
}

export function normalizeModel(raw: string, year?: number): string {
  for (const [re, slug] of MODEL_MAP) {
    if (re.test(raw)) {
      // Prado 250-series launched in 2024; catch-all 'prado' pattern defaults to 150
      if (slug === 'prado-150' && year && year >= 2024) return 'prado-250';
      // New Land Cruiser FJ launched 2026; older "Land Cruiser FJ" listings are FJ Cruisers
      if (slug === 'land-cruiser-fj' && year && year <= 2025) return 'fj-cruiser';
      // Hilux / Fortuner → engine-era slugs (hilux-gd6, fortuner-d4d, …)
      if (slug === 'hilux' || slug === 'fortuner') return `${slug}-${hiluxFortunerEra(raw, year)}`;
      return slug;
    }
  }
  return 'other';
}

// Canonical Land Cruiser model slugs — the 12 we surface and value. Single
// source of truth for the valuation tool's model picker, route allowlist and
// sitemap. Validate membership with LC_MODEL_SLUG_SET (do NOT use normalizeModel,
// which maps free text and can fall through to 'other'/hilux/fortuner).
export const LC_MODEL_SLUGS = [
  '70-series', '76-series', '78-series', '79-series', '80-series', '100-series',
  '200-series', '300-series', 'prado-150', 'prado-250', 'fj-cruiser', 'land-cruiser-fj',
] as const;
export const LC_MODEL_SLUG_SET: ReadonlySet<string> = new Set(LC_MODEL_SLUGS);

// Launch years for young-cohort detection in the valuation engine — models too
// new to have a meaningful used-market depreciation signal.
export const MODEL_LAUNCH_YEAR: Record<string, number> = {
  '300-series': 2021,
  'prado-250': 2024,
  'land-cruiser-fj': 2026,
};

const PROVINCE_MAP: Record<string, string> = {
  'gauteng': 'Gauteng',
  'western cape': 'Western Cape',
  'kwazulu-natal': 'KwaZulu-Natal', 'kwazulu natal': 'KwaZulu-Natal', 'kzn': 'KwaZulu-Natal',
  'eastern cape': 'Eastern Cape',
  'limpopo': 'Limpopo',
  'mpumalanga': 'Mpumalanga',
  'north west': 'North West',
  'free state': 'Free State',
  'northern cape': 'Northern Cape',
};

export function normalizeProvince(raw: string): string {
  const key = raw.toLowerCase().trim();
  return PROVINCE_MAP[key] ?? raw;
}

// Display labels for model slugs (overrides the generic title-case fallback)
const MODEL_LABELS: Record<string, string> = {
  'hilux-gd6': 'Hilux GD-6', 'hilux-d4d': 'Hilux D-4D',
  'fortuner-gd6': 'Fortuner GD-6', 'fortuner-d4d': 'Fortuner D-4D',
};
const MODEL_ERA: Record<string, string> = {
  'hilux-gd6': '2016 onward', 'hilux-d4d': 'pre-2016',
  'fortuner-gd6': '2016 onward', 'fortuner-d4d': 'pre-2016',
};
export function modelLabel(model: string): string {
  return MODEL_LABELS[model]
    ?? model.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/Fj/, 'FJ');
}
export function modelEra(model: string): string | null {
  return MODEL_ERA[model] ?? null;
}
