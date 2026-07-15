const MODEL_MAP: [RegExp, string][] = [
  // ── Classics, by chassis code ── must precede BOTH the 'land-cruiser-fj' catch
  // below (which would swallow "Land Cruiser FJ40" and then, being pre-2026, map
  // it to the fj-cruiser — a 2011+ retro SUV, not a 1976 40-series) and the
  // 78-series 'troop.?carrier' alternative (an FJ45 Troopy is a 40-series).
  // Chassis codes are unambiguous, so matching them first is safe.
  // Petrol (FJ), diesel (BJ/HJ) and the full body range of each generation:
  //   40-series FJ/BJ/HJ40–47 · 55-series FJ/HJ55 · 60-series FJ/BJ/HJ60–62
  [/\b[fbh]j[\s-]?4[0-7]\b/i,                        '40-series'],
  [/\b[fbh]j[\s-]?55\b/i,                            '55-series'],
  [/\b[fbh]j[\s-]?6[0-2]\b/i,                        '60-series'],
  // Prado must come before the numbered series — "Land Cruiser Prado" contains
  // "Land Cruiser" which would otherwise fall through to a numbered-series
  // pattern if variant text contains a series number (e.g. "70th Anniversary Edition").
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
  // ── Suzuki Jimny ── collected only when the Jimny scraper runs (SCRAPE_SEGMENT=jimny);
  // routed to Jimny SA, never shown on the Land Cruiser site. Listed last so LC always wins.
  [/\bjimny\b/i,                                      'jimny'],
];

// Adjacent Toyota-4x4 segment — collected for data and shown on the public
// market pages, but kept out of the LC classifieds. Drives the `segment` column.
export const LC_SEGMENT = 'land-cruiser';
export function segmentForModel(model: string): string {
  if (model.startsWith('jimny')) return 'jimny'; // routed to Jimny SA, not stored/shown here
  return (model.startsWith('hilux') || model.startsWith('fortuner')) ? 'toyota-4x4' : LC_SEGMENT;
}

// ── Body-type detection ──────────────────────────────────────────────────────
// Game viewers (open safari vehicles) carry the signal differently per portal:
// cars.co.za puts "Game Viewer" / "Game Drive Vehicle" in the title; AutoTrader
// keeps a plain spec title and buries it in the (backfilled) description. Title
// patterns can be loose; description patterns must be strict — bare "safari" or
// "viewing vehicle" false-positive on ordinary dealer copy ("arrange a viewing,
// vehicle is available…"), verified against prod data 2026-07-04.
const GAME_VIEWER_TITLE_RE =
  /game[\s-]?view|game[\s-]?drive|safari[\s-]?(?:conversion|vehicle|spec)/i;
// The description alternative must be the NOUN form ("game viewer"), never bare
// "game view/viewing" — sellers mention game-viewing as a past USE on standard
// bakkies ("previously used on the farm as a game-viewing/support vehicle"),
// which put a stock 79 single cab on /game-viewers/ (id 16938, 2026-07-13).
const GAME_VIEWER_DESC_RE =
  /game[\s-]?viewer|game[\s-]?drive[\s-]?(?:vehicle|conversion)|safari[\s-]?(?:conversion|vehicle|ready|spec)|open\s(?:safari|game)/i;

// Returns 'game-viewer' or null (unclassified). Never returns 'standard' — that
// value is an explicit admin opt-out; callers must only fill body_type when it
// is currently NULL so a manual verdict survives re-ingest.
export function detectBodyType(title: string, description = ''): string | null {
  if (GAME_VIEWER_TITLE_RE.test(title) || GAME_VIEWER_DESC_RE.test(description)) return 'game-viewer';
  return null;
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
      // The generic 'prado' match defaults to the J150; split the other Prado
      // generations out by model year (they don't overlap in SA):
      //   J90 ≤2002 · J120 2003–2008 · J150 2009–2023 · J250 2024+
      if (slug === 'prado-150' && year) {
        if (year >= 2024) return 'prado-250';
        if (year <= 2002) return 'prado-90';
        if (year <= 2008) return 'prado-120';
      }
      // A bare "Land Cruiser FJ" splits three ways by year: pre-1990 is a
      // classic with the chassis number missing from the title (AT lists a 1983
      // "Land Cruiser FJ 4.2"). 40-series is the default because SA sellers
      // titling a classic without its code are near-always selling a 40/45 —
      // FJ60/62s carry their code, which the chassis patterns above catch first.
      // 1990–2025 is the retro FJ Cruiser; 2026+ is the new Land Cruiser FJ.
      if (slug === 'land-cruiser-fj' && year && year <= 1990) return '40-series';
      if (slug === 'land-cruiser-fj' && year && year <= 2025) return 'fj-cruiser';
      // Hilux / Fortuner → engine-era slugs (hilux-gd6, fortuner-d4d, …)
      if (slug === 'hilux' || slug === 'fortuner') return `${slug}-${hiluxFortunerEra(raw, year)}`;
      // Suzuki Jimny → generation split by engine keyword, else year (4th-gen launched late 2018)
      if (slug === 'jimny') {
        if (/1\.?3\b/.test(raw)) return 'jimny-1-3';
        if (/1\.?5\b/.test(raw)) return 'jimny';
        return (year && year <= 2018) ? 'jimny-1-3' : 'jimny';
      }
      return slug;
    }
  }
  return 'other';
}

// Land Cruiser model slugs the valuation tool offers — the single source of
// truth for the model picker, route allowlist and sitemap. Validate membership
// with LC_MODEL_SLUG_SET (NOT normalizeModel, which maps free text and can fall
// through to 'other'/hilux/fortuner).
//
// NB: the bare '70-series' is deliberately EXCLUDED. The 70 Series is a family
// (76 wagon / 78 Troopcarrier / 79 bakkie), so offering it as a peer is
// confusing and its mixed cohort is noisy — owners pick the specific body below.
// '70-series' remains a valid INGEST slug (see MODEL_MAP) and shows on /market/.
//
// The chassis-code classics ('40-series' / '55-series' / '60-series') are
// excluded on the same terms, for a stronger reason: they're APPRECIATING
// collectibles priced on originality and provenance, not depreciating 4x4s
// priced on year+mileage — the only inputs the cohort engine has. A handful of
// listings whose value is set by condition we can't see would produce a
// confident-looking number that is simply wrong. They still ingest and show.
export const LC_MODEL_SLUGS = [
  '76-series', '78-series', '79-series', '80-series', '100-series',
  '200-series', '300-series', 'prado-90', 'prado-120', 'prado-150', 'prado-250', 'fj-cruiser', 'land-cruiser-fj',
] as const;
export const LC_MODEL_SLUG_SET: ReadonlySet<string> = new Set(LC_MODEL_SLUGS);

// Adjacent Toyota 4x4s (Hilux/Fortuner) we already aggregate and can value off
// the same cohort engine (getCohortStats is segment-agnostic). Kept SEPARATE
// from LC_MODEL_SLUGS — that list means "Land Cruiser" for IG/market/family
// logic. ONLY the valuation tool spans both segments, via the sets below.
export const TOYOTA_4X4_SLUGS = ['fortuner-d4d', 'fortuner-gd6', 'hilux-d4d', 'hilux-gd6'] as const;
export const VALUATION_MODEL_SLUGS = [...LC_MODEL_SLUGS, ...TOYOTA_4X4_SLUGS] as const;
export const VALUATION_MODEL_SLUG_SET: ReadonlySet<string> = new Set(VALUATION_MODEL_SLUGS);

// Model FAMILIES — so IG-post diversity works at the family level: posting one
// Prado should suppress ALL Prado slugs (prado-90/120/150/250), not just the
// exact one. Keep in lockstep with LC_MODEL_SLUGS; a slug missing here falls back
// to its own slug (its own rotation bucket), which silently re-creates the
// per-slug bug for that model — so add new slugs here too.
export const MODEL_FAMILY: Record<string, string> = {
  'prado-90': 'prado', 'prado-120': 'prado', 'prado-150': 'prado', 'prado-250': 'prado',
  '76-series': '70-series', '78-series': '70-series', '79-series': '70-series', '70-series': '70-series',
  'fj-cruiser': 'fj', 'land-cruiser-fj': 'fj',
  // Chassis-code classics share one rotation bucket: they're one collector
  // cohort to a follower, and they're rare enough that per-slug buckets would
  // let three FJs post back-to-back.
  '40-series': 'classic', '55-series': 'classic', '60-series': 'classic',
  '80-series': 'main-line', '100-series': 'main-line', '200-series': 'main-line', '300-series': 'main-line',
};
export function modelFamily(model: string): string {
  return MODEL_FAMILY[model] ?? model;
}

// Launch years for young-cohort detection in the valuation engine — models too
// new to have a meaningful used-market depreciation signal.
export const MODEL_LAUNCH_YEAR: Record<string, number> = {
  '300-series': 2021,
  'prado-250': 2024,
  'land-cruiser-fj': 2026,
};

// Production-year bounds per model — drives the valuation year picker (client
// rebuilds the year dropdown on model change) and server-side validation, so a
// user can't value a "2015 Prado 250" (launched 2024) or a pre-2026 FJ. Bounds
// are generous on the low end to avoid rejecting genuine early imports; the
// upper bound is capped to the current year + 1 at use sites.
export const MODEL_YEAR_RANGE: Record<string, [number, number]> = {
  '76-series':       [2000, 2026],
  '78-series':       [2011, 2026],
  '79-series':       [1985, 2026],
  '80-series':       [1989, 1998],
  '100-series':      [1997, 2008],
  '200-series':      [2007, 2022],
  '300-series':      [2021, 2026],
  'prado-90':        [1996, 2003],
  'prado-120':       [2002, 2009],
  'prado-150':       [2009, 2024],
  'prado-250':       [2024, 2026],
  'fj-cruiser':      [2011, 2024],
  'land-cruiser-fj': [2026, 2027],
  // Toyota 4x4 (valuation tool only) — split by engine era like prado-150/250.
  'fortuner-d4d':    [2006, 2016],
  'fortuner-gd6':    [2015, 2026],
  'hilux-d4d':       [2005, 2016],
  'hilux-gd6':       [2015, 2026],
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
