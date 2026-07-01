// Camper-trailer rental operators compared in the camper-trailer-hire guide.
// `slug` matches the key in operator-ratings.json (live Google ratings). Order
// = how they appear in the comparison table (Kampi first as the P2P option,
// then fleet specialists roughly by rating).
export interface TrailerOperator {
  slug: string;
  name: string;
  url: string;
  type: 'P2P' | 'Fleet';
  based: string;
  fromPerDay: number | null; // indicative rand/day, or null if not published
  note: string;
}

export const TRAILER_OPERATORS: TrailerOperator[] = [
  { slug: 'kampi',     name: 'Kampi',     url: 'https://kampi.co.za/',                     type: 'P2P',   based: 'Nationwide',    fromPerDay: 519,  note: 'Widest choice; quality varies by owner' },
  { slug: 'go-camp',   name: 'Go Camp',   url: 'https://www.gocamp.co.za/trailer-rentals', type: 'Fleet', based: 'Cape Town & JHB', fromPerDay: null, note: 'Code B & EB options; 3-night minimum' },
  { slug: 'kubu-4x4',  name: 'Kubu 4x4',  url: 'https://kubu4x4.co.za/',                   type: 'Fleet', based: '5 branches',    fromPerDay: null, note: 'Biggest specialist fleet' },
  { slug: 'conqueror', name: 'Conqueror', url: 'https://conqueror.co.za/rentals/',         type: 'Fleet', based: 'Johannesburg',  fromPerDay: null, note: 'Premium; award-winning' },
  { slug: 'camp-guru', name: 'Camp Guru', url: 'https://www.campguru.co.za/',              type: 'Fleet', based: 'Edenvale',      fromPerDay: null, note: 'Budget–luxury; no cross-border' },
  { slug: 'bundu',     name: 'Bundu',     url: 'https://www.bunducaravanhire.co.za/',      type: 'Fleet', based: 'Hartbeespoort', fromPerDay: 750,  note: 'Cross-border allowed' },
  { slug: 'campezi',   name: 'CampEzi',   url: 'https://campezi.co.za/',                   type: 'Fleet', based: 'Pretoria',      fromPerDay: null, note: 'Echo 3 tows on a Code B licence' },
];
