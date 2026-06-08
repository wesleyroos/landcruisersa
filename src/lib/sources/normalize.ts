const MODEL_MAP: [RegExp, string][] = [
  // Prado must come first — "Land Cruiser Prado" contains "Land Cruiser" which
  // would otherwise fall through to a numbered-series pattern if variant text
  // contains a series number (e.g. "70th Anniversary Edition").
  [/prado.?250|250[\s-]?series/i,                    'prado-250'],
  [/prado.?150|150[\s-]?series|prado/i,              'prado-150'],
  [/79[\s-]?series|lc79|land.?cruiser.?79/i,         '79-series'],
  [/76[\s-]?series|lc76|land.?cruiser.?76/i,         '76-series'],
  [/78[\s-]?series|troopcarrier|troop.?carrier/i,    '78-series'],
  [/70[\s-]?series|lc70|land.?cruiser.?70/i,         '70-series'],
  [/300[\s-]?series|lc300|land.?cruiser.?300/i,      '300-series'],
  [/200[\s-]?series|lc200|land.?cruiser.?200/i,      '200-series'],
  [/100[\s-]?series|lc100|land.?cruiser.?100/i,      '100-series'],
  [/80[\s-]?series|lc80|land.?cruiser.?80/i,         '80-series'],
  [/land.?cruiser.?fj|fj[\s-]?cruiser/i,              'fj-cruiser'],
];

export function normalizeModel(raw: string, year?: number): string {
  for (const [re, slug] of MODEL_MAP) {
    if (re.test(raw)) {
      // Prado 250-series launched in 2024; catch-all 'prado' pattern defaults to 150
      if (slug === 'prado-150' && year && year >= 2024) return 'prado-250';
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
