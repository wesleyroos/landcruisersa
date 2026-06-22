// Land Cruiser rental operators — the spine of the rental cornerstone page, and
// the forward-compatible foundation for a future curated booking platform
// (see docs/rental-cornerstone-spec.md). Editorial directory: outbound links are
// rel="noopener" (NOT sponsored — no paid relationship), no UTM. This is NOT
// lead-gen; it's an authority resource.
//
// ACCURACY RULE: never present an unverified review number as fact. Set
// rating.verified=false when the figure couldn't be confirmed; the UI renders
// those qualitatively. Always show lastVerified + "confirm before booking".

export interface RentalOperator {
  slug: string;
  name: string;
  website: string;
  basedIn: string[];
  pickupPoints?: string[];
  countriesCovered: string[];
  vehicles: { model: string; sleeps: number; rooftopTents: number; selfDrive: boolean }[];
  equipment: string[];
  pricePerDayZar?: { low: number; high: number };
  minRentalDays?: number;
  unlimitedKm?: boolean;
  oneWay?: boolean;
  crossBorder: boolean;
  rating?: { value: number; source: 'Google' | 'Trustpilot' | 'TripAdvisor'; count: number; verified: boolean };
  yearsOperating?: number;
  usp: string;
  lastVerified: string; // ISO date
  // Reserved for the booking-platform phase — unused in v1:
  partnerStatus?: 'none' | 'contacted' | 'agreed';
  commissionPct?: number;
}

// Curated order = recommended order (best-supported first).
export const RENTAL_OPERATORS: RentalOperator[] = [
  {
    slug: 'bushlore',
    name: 'Bushlore',
    website: 'https://bushlore.com/',
    basedIn: ['Midrand, Gauteng'],
    pickupPoints: ['OR Tambo (Johannesburg)'],
    countriesCovered: ['South Africa', 'Namibia', 'Botswana', 'Zambia', 'Zimbabwe', 'Mozambique'],
    vehicles: [
      { model: 'Land Cruiser 79 Single Cab', sleeps: 2, rooftopTents: 1, selfDrive: true },
      { model: 'Land Cruiser 79 Double Cab', sleeps: 4, rooftopTents: 2, selfDrive: true },
      { model: 'Land Cruiser 79 Bush Camper', sleeps: 2, rooftopTents: 1, selfDrive: true },
    ],
    equipment: ['Rooftop tent + bedding', 'Fridge', 'Dual battery + solar', 'Long-range fuel', 'Water tank', 'Camp kitchen', 'Recovery kit'],
    pricePerDayZar: { low: 3000, high: 5600 },
    minRentalDays: 8,
    crossBorder: true,
    rating: { value: 4.7, source: 'Google', count: 129, verified: true },
    yearsOperating: 20,
    usp: 'The market reference — a Land Cruiser 79 specialist with 20+ years behind it and published pricing.',
    lastVerified: '2026-06-22',
  },
  {
    slug: 'voetspore-rentals',
    name: 'Voetspore Rentals',
    website: 'https://voetsporerentals.com/',
    basedIn: ['Montana, Pretoria'],
    pickupPoints: ['OR Tambo (Johannesburg)'],
    countriesCovered: ['South Africa', 'Namibia', 'Botswana', 'Zimbabwe', 'Zambia', 'Mozambique', 'Malawi', 'Tanzania', 'plus more — 14 in total'],
    vehicles: [
      { model: 'Land Cruiser 79 (2.8L)', sleeps: 3, rooftopTents: 1, selfDrive: true },
      { model: 'Land Cruiser 79 Camper (4.2L)', sleeps: 3, rooftopTents: 1, selfDrive: true },
    ],
    equipment: ['Rooftop tent + bedding', 'Fridge', 'Dual battery', 'Recovery kit', 'Camp kitchen'],
    pricePerDayZar: { low: 3800, high: 4100 },
    crossBorder: true,
    usp: 'From the team behind the famous Voetspore expeditions; advertises insurance cover across 14 African countries.',
    lastVerified: '2026-06-22',
  },
  {
    slug: 'adventus-4x4',
    name: 'Adventus 4x4 Rentals',
    website: 'https://adventus4x4rentals.co.za/',
    basedIn: ['Paarl, Western Cape', 'Pretoria, Gauteng'],
    pickupPoints: ['Cape Town International', 'OR Tambo (Johannesburg)'],
    countriesCovered: ['South Africa', 'Namibia', 'Botswana', 'Zimbabwe', 'Mozambique'],
    vehicles: [
      { model: 'Land Cruiser 79 Single Cab camper', sleeps: 2, rooftopTents: 1, selfDrive: true },
    ],
    equipment: ['Rooftop tent', 'Fridge/freezer', 'Gas stove', 'Solar', 'Hot-water shower', 'Recovery kit'],
    crossBorder: true,
    usp: 'The best Cape Town-side option — fully off-grid single-cab LC79 campers, with a Western Cape base few operators offer.',
    lastVerified: '2026-06-22',
  },
  {
    slug: 'sa-4x4-rentals',
    name: 'SA 4x4 Rentals',
    website: 'https://sa4x4rentals.com/',
    basedIn: ['Alberton, Gauteng'],
    pickupPoints: ['OR Tambo (delivery)'],
    countriesCovered: ['South Africa', 'Namibia', 'Botswana'],
    vehicles: [
      { model: 'Land Cruiser 70 Double Cab (manual)', sleeps: 4, rooftopTents: 2, selfDrive: true },
      { model: 'Land Cruiser 70 Double Cab (auto)', sleeps: 4, rooftopTents: 2, selfDrive: true },
    ],
    equipment: ['Rooftop tent + bedding', 'Fridge', 'Recovery kit', 'Camp kitchen'],
    unlimitedKm: true,
    oneWay: true,
    crossBorder: true,
    rating: { value: 4.5, source: 'Google', count: 70, verified: false },
    usp: 'Strong on value — unlimited kilometres, free additional drivers and free Johannesburg pickup/drop-off.',
    lastVerified: '2026-06-22',
  },
  {
    slug: 'asco-car-hire',
    name: 'Asco Car Hire',
    website: 'https://www.ascocarhire.com/',
    basedIn: ['Windhoek, Namibia', 'Cape Town, Western Cape'],
    pickupPoints: ['Windhoek', 'Walvis Bay', 'Cape Town'],
    countriesCovered: ['Namibia', 'South Africa', 'Botswana', 'Zambia', 'Zimbabwe'],
    vehicles: [
      { model: 'Land Cruiser (camping-equipped)', sleeps: 4, rooftopTents: 2, selfDrive: true },
    ],
    equipment: ['Rooftop tent(s)', 'Fridge', 'Camp kitchen', 'Recovery kit'],
    oneWay: true,
    crossBorder: true,
    rating: { value: 4.7, source: 'Trustpilot', count: 1332, verified: true },
    usp: 'The largest verified review base of the group; ideal if your trip centres on Namibia or you want a one-way SA–Namibia rental.',
    lastVerified: '2026-06-22',
  },
];
