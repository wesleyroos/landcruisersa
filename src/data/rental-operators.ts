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
    rating: { value: 5.0, source: 'Google', count: 3, verified: true },
    usp: 'The best Cape Town-side option — fully off-grid single-cab LC79 campers, with a Western Cape base few operators offer.',
    lastVerified: '2026-06-22',
  },
  {
    slug: 'techpro-safari',
    name: 'Techpro Safari',
    website: 'https://www.techprosafari.com/',
    basedIn: ['Cape Town, Western Cape', 'Windhoek, Namibia'],
    pickupPoints: ['Cape Town International'],
    countriesCovered: ['South Africa', 'Namibia', 'Botswana', 'Zimbabwe', 'Zambia', 'Mozambique'],
    vehicles: [
      { model: 'Land Cruiser 79 (purpose-built camper)', sleeps: 2, rooftopTents: 1, selfDrive: true },
    ],
    equipment: ['Rooftop tent', 'Fridge/freezer', 'Dual battery + solar', 'Water tank', 'Camp kitchen', 'Recovery kit'],
    crossBorder: true,
    usp: 'Purpose-built, fully self-sufficient LC79 expedition campers from a Cape Town specialist favoured by serious overlanders.',
    lastVerified: '2026-06-22',
  },
  {
    slug: 'avis-safari',
    name: 'Avis Safari Rental',
    website: 'https://www.avis.co.za/safari-rental/overlanding-vehicles-for-hire/toyota-land-cruiser',
    basedIn: ['Branches nationwide'],
    pickupPoints: ['Major SA airports'],
    countriesCovered: ['South Africa', 'Namibia', 'Botswana', 'Zimbabwe', 'Zambia'],
    vehicles: [
      { model: 'Land Cruiser 76 (4.2 diesel)', sleeps: 4, rooftopTents: 2, selfDrive: true },
    ],
    equipment: ['Rooftop tents (sleeps 4)', 'Ground change room (2×2m)', '90L fridge/freezer', 'Dual battery + solar', '175L fuel range', 'Recovery kit', 'Camp kitchen'],
    crossBorder: true,
    usp: 'Big-brand national footprint and nationwide backup — an LC76 self-drive camper with rooftop tents plus a separate ground change room.',
    lastVerified: '2026-06-22',
  },
  {
    slug: 'berg-4x4',
    name: 'Berg 4x4 Rentals',
    website: 'https://www.berg4x4rentals.co.za/vehicles/expedition/',
    basedIn: ['Atlantis, Western Cape'],
    pickupPoints: ['Cape Town International'],
    countriesCovered: ['South Africa', 'Namibia', 'Botswana'],
    vehicles: [
      { model: 'Land Cruiser Prado / 200-series Double Cab (2.8D / V6 / V8)', sleeps: 4, rooftopTents: 1, selfDrive: true },
    ],
    equipment: ['Rooftop + ground tent', '270° awning', 'Dual fridges', 'Dual battery + solar', 'Water tank', 'Recovery kit'],
    crossBorder: true,
    usp: 'A Cape Town option running modern Land Cruiser campers (Prado/200-series, not the 70-series) — comfort-biased, well-kitted self-drive.',
    lastVerified: '2026-06-22',
  },
  {
    slug: 'bushtrackers',
    name: 'Bushtrackers',
    website: 'https://bushtrackers.com/',
    basedIn: ['Midrand, Gauteng', 'Cape Town, Western Cape'],
    pickupPoints: ['OR Tambo (Johannesburg)', 'Cape Town International'],
    countriesCovered: ['South Africa', 'Botswana', 'Namibia', 'Zimbabwe'],
    vehicles: [
      { model: 'Land Cruiser 79 Double Cab 4.2D (equipped or unequipped)', sleeps: 4, rooftopTents: 2, selfDrive: true },
    ],
    equipment: ['Rooftop tent + bedding', 'Fridge/freezer', 'Dual battery', 'Recovery kit', 'Camp kitchen'],
    crossBorder: true,
    usp: 'Genuine LC79 4.2D camper from Johannesburg & Cape Town. Inspect and photograph the vehicle thoroughly at handover — there are recurring billing / damage-dispute complaints.',
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
    usp: 'The largest verified review base of the group (4.7 on Trustpilot, 1,300+). Namibia-based with a Cape Town branch — strong for Namibia-centred trips and one-way SA–Namibia rentals.',
    lastVerified: '2026-06-22',
  },
];
