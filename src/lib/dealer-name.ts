// Dealer identity — one place that decides "are these two seller_name strings
// the same physical dealership?", shared by the dealer radar (/admin/dealers)
// and the per-dealership stock page (/admin/dealers/[key]).
//
// Scraped listings carry the dealer's name as free text from each portal, so
// the SAME branch arrives spelled slightly differently ("Omar's Motor Den" on
// AutoTrader, "Omars Motor Den" on Cars.co.za). `dealerKey` folds those
// together. It deliberately does NOT merge branches of a group — branches buy
// and price independently, so "Halfway Toyota Honeydew" and "Halfway Toyota
// Shelly Beach" stay separate dealerships.

/** Canonical identity for a dealership name. Also the URL segment. */
export function dealerKey(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\binvestment\b/g, 'investments')
    .replace(/\bvanderbijlpark\b/g, 'vdbp')
    .replace(/\s+/g, ' ').trim()
    .replace(/ /g, '-');
}

/** Loose group guess (first two words) — used for clustering/labels only, never identity. */
export function dealerGroupKey(name: string): string {
  return dealerKey(name).split('-').slice(0, 2).join(' ');
}

export const SOURCE_LABEL: Record<string, string> = {
  autotrader: 'AutoTrader', wbc: 'WeBuyCars', adios: 'Adios',
  wbb: 'We Buy Bakkies', carsza: 'Cars.co.za', vcsa: 'Vintage Cars SA', own: 'Own listing',
};
