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

// Models that belong to the Land Cruiser brand vs adjacent segments we collect
// data for but do not show on landcruisersa.co.za. Drives the `segment` column.
const NON_LC_MODELS = new Set(['hilux', 'fortuner']);
export const LC_SEGMENT = 'land-cruiser';
export function segmentForModel(model: string): string {
  return NON_LC_MODELS.has(model) ? 'toyota-4x4' : LC_SEGMENT;
}

export function normalizeModel(raw: string, year?: number): string {
  for (const [re, slug] of MODEL_MAP) {
    if (re.test(raw)) {
      // Prado 250-series launched in 2024; catch-all 'prado' pattern defaults to 150
      if (slug === 'prado-150' && year && year >= 2024) return 'prado-250';
      // New Land Cruiser FJ launched 2026; older "Land Cruiser FJ" listings are FJ Cruisers
      if (slug === 'land-cruiser-fj' && year && year <= 2025) return 'fj-cruiser';
      return slug;
    }
  }
  return 'other';
}

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
