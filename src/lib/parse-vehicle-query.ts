// Rules-based natural-language → structured filters for the vehicle search.
// Pure + dependency-free so it runs instantly client-side (no network, no LLM).
// Maps free text like "200 series under R700k with less than 100k km in gauteng"
// to the same filter shape the listings page + homepage already understand.
// Unparseable phrasing simply isn't matched (an LLM fallback is a future V2).

export interface ParsedQuery {
  models: string[];          // canonical values: '200-series' | 'prado' | 'fj' | ...
  minYear?: number;
  maxYear?: number;
  minPrice?: number;
  maxPrice?: number;
  minMileage?: number;
  maxMileage?: number;
  provinces: string[];       // canonical: 'Gauteng' | 'Western Cape' | ...
  cab?: 'single' | 'double'; // 79-series body style — matched against the title
  chips: { key: string; label: string }[]; // human-readable interpretation
  matched: boolean;          // did we understand anything at all?
}

const MODEL_ALIASES: [RegExp, string, string][] = [
  [/\b(300[\s-]?series|lc\s?300|land\s?cruiser\s?300|\b300\b)/, '300-series', '300 Series'],
  [/\b(200[\s-]?series|lc\s?200|land\s?cruiser\s?200|\b200\b)/, '200-series', '200 Series'],
  [/\b(100[\s-]?series|lc\s?100|land\s?cruiser\s?100|\b100\b)/, '100-series', '100 Series'],
  [/\b(80[\s-]?series|lc\s?80|\b80\b)/, '80-series', '80 Series'],
  [/\b(79[\s-]?series|lc\s?79|\b79\b)/, '79-series', '79 Series'],
  [/\b(78[\s-]?series|troop\s?carrier|troopy|\b78\b)/, '78-series', '78 Series'],
  [/\b(76[\s-]?series|lc\s?76|\b76\b)/, '76-series', '76 Series'],
  [/\b(prado|150|250|land\s?cruiser\s?prado)/, 'prado', 'Prado'],
  [/\b(fj\s?cruiser|\bfj\b)/, 'fj', 'FJ Cruiser'],
];

const PROVINCE_ALIASES: [RegExp, string][] = [
  [/\b(gauteng|gp|jhb|joburg|johannesburg|pretoria|centurion|midrand|sandton)\b/, 'Gauteng'],
  [/\b(western\s?cape|w\.?cape|wc|cape\s?town|stellenbosch|somerset\s?west)\b/, 'Western Cape'],
  [/\b(kwazulu[\s-]?natal|kzn|durban|umhlanga|pietermaritzburg|pmb)\b/, 'KwaZulu-Natal'],
  [/\b(eastern\s?cape|ec|gqeberha|port\s?elizabeth|\bpe\b|east\s?london)\b/, 'Eastern Cape'],
  [/\b(limpopo|polokwane)\b/, 'Limpopo'],
  [/\b(mpumalanga|nelspruit|mbombela)\b/, 'Mpumalanga'],
  [/\b(north\s?west|nw|rustenburg|potchefstroom)\b/, 'North West'],
  [/\b(free\s?state|fs|bloemfontein|bloem)\b/, 'Free State'],
  [/\b(northern\s?cape|nc|kimberley|upington)\b/, 'Northern Cape'],
];

// "700k" → 700000, "1.2m" → 1200000, "700 000"/"700,000"/"700000" → 700000
function amount(raw: string): number | null {
  const s = raw.toLowerCase().replace(/[, ]/g, '').replace(/^r/, '');
  const m = s.match(/^(\d+(?:\.\d+)?)(k|m|mil|million)?$/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (m[2]?.startsWith('m')) n *= 1_000_000;
  else if (m[2] === 'k') n *= 1_000;
  return Math.round(n);
}

const LOWER = /(under|below|less than|up to|max(?:imum)?|<|cheaper than|no more than)/;
const UPPER = /(over|above|more than|from|min(?:imum)?|at least|>|newer than|after)/;

export function parseVehicleQuery(input: string): ParsedQuery {
  const out: ParsedQuery = { models: [], provinces: [], chips: [], matched: false };
  if (!input) return out;
  let q = ' ' + input.toLowerCase().replace(/\s+/g, ' ').trim() + ' ';

  // 1. Mileage — any number followed by km (blank it out so price parsing skips it).
  q = q.replace(/(\w+\s+){0,3}?(\d[\d, ]*\.?\d*\s*k?)\s*(km|kms|kilomet\w+)/g, (full, _pre, num) => {
    const val = amount(num.replace(/\s*k$/, 'k').replace(/\s/g, '')) ?? amount(num.trim() + (/k$/.test(num.trim()) ? '' : ''));
    const v = amount(num.trim());
    const n = v ?? val;
    if (n != null) {
      const before = full.toLowerCase();
      if (UPPER.test(before)) { out.minMileage = n; out.chips.push({ key: 'minMileage', label: `≥ ${km(n)}` }); }
      else { out.maxMileage = n; out.chips.push({ key: 'maxMileage', label: `≤ ${km(n)}` }); }
      out.matched = true;
    }
    return ' ';
  });
  if (/\blow\s?(km|mileage|kms)\b/.test(q) && out.maxMileage == null) {
    out.maxMileage = 100_000; out.chips.push({ key: 'maxMileage', label: '≤ 100k km (low)' }); out.matched = true;
    q = q.replace(/\blow\s?(km|mileage|kms)\b/, ' ');
  }

  // 2. Year — a 19xx/20xx number, optionally with a comparator ("after 2018", "2019+").
  q = q.replace(/(under|below|before|up to|from|after|newer than|since|over|above)?\s*(19|20)(\d{2})\s*(\+|or newer|onwards)?/g, (full, cmp, cc, yy, plus) => {
    const yr = parseInt(cc + yy, 10);
    if (yr >= 1980 && yr <= 2100) {
      const before = (cmp || '') + (plus || '');
      if (/under|below|before|up to/.test(before)) { out.maxYear = yr; out.chips.push({ key: 'maxYear', label: `≤ ${yr}` }); }
      else { out.minYear = yr; out.chips.push({ key: 'minYear', label: `${yr}+` }); }
      out.matched = true;
      return ' ';
    }
    return full;
  });

  // 3. Price — remaining R / k / m amounts, with a comparator.
  q = q.replace(/(under|below|less than|up to|max(?:imum)?|<|cheaper than|no more than|over|above|more than|from|min(?:imum)?|at least|>|budget of|around|price)?\s*(r\s?\d[\d, ]*\.?\d*\s*(?:k|m|mil|million)?|\d[\d, ]*\.?\d*\s*(?:k|m|mil|million))/g, (full, cmp, val) => {
    const n = amount(val.trim());
    if (n == null || n < 1000) return full; // ignore tiny stray numbers
    const before = (cmp || full).toLowerCase();
    if (UPPER.test(before)) { out.minPrice = n; out.chips.push({ key: 'minPrice', label: `≥ ${rand(n)}` }); }
    else { out.maxPrice = n; out.chips.push({ key: 'maxPrice', label: `≤ ${rand(n)}` }); }
    out.matched = true;
    return ' ';
  });

  // 4. Provinces (+ cities).
  for (const [re, prov] of PROVINCE_ALIASES) {
    if (re.test(q) && !out.provinces.includes(prov)) {
      out.provinces.push(prov);
      out.chips.push({ key: 'province', label: prov });
      out.matched = true;
    }
  }

  // 4b. Body style — single / double cab (79-series). Filtered via the title.
  if (/\b(single[\s-]?cab|s\/?cab|singlecab)\b/.test(q)) {
    out.cab = 'single'; out.chips.push({ key: 'cab', label: 'Single Cab' }); out.matched = true;
  } else if (/\b(double[\s-]?cab|d\/?cab|doublecab|crew[\s-]?cab)\b/.test(q)) {
    out.cab = 'double'; out.chips.push({ key: 'cab', label: 'Double Cab' }); out.matched = true;
  }

  // 5. Models (last — the leftover digits are now model numbers, not price/km/year).
  for (const [re, val, label] of MODEL_ALIASES) {
    if (re.test(q) && !out.models.includes(val)) {
      out.models.push(val);
      out.chips.unshift({ key: 'model', label });
      out.matched = true;
    }
  }

  return out;
}

function rand(n: number): string {
  return n >= 1_000_000
    ? 'R' + (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + 'm'
    : 'R' + Math.round(n / 1000) + 'k';
}
function km(n: number): string {
  return n >= 1000 ? Math.round(n / 1000) + 'k km' : n + ' km';
}

// Build a /listings/ query string from a parsed result (used by the homepage).
export function toListingsUrl(p: ParsedQuery): string {
  const params = new URLSearchParams();
  if (p.models.length) params.set('model', p.models.join(','));
  if (p.provinces.length) params.set('province', p.provinces.join(','));
  if (p.minPrice != null) params.set('minPrice', String(p.minPrice));
  if (p.maxPrice != null) params.set('maxPrice', String(p.maxPrice));
  if (p.minMileage != null) params.set('minMileage', String(p.minMileage));
  if (p.maxMileage != null) params.set('maxMileage', String(p.maxMileage));
  if (p.minYear != null) params.set('minYear', String(p.minYear));
  if (p.maxYear != null) params.set('maxYear', String(p.maxYear));
  if (p.cab) params.set('cab', p.cab);
  const qs = params.toString();
  return '/listings/' + (qs ? '?' + qs : '');
}
