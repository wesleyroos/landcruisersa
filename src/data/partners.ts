export interface Partner {
  slug: string;
  name: string;
  category: 'Tours' | 'Training' | 'Services' | 'Gear';
  location: string;
  tagline: string;
  description: string;
  longDescription: string;
  email?: string;
  website?: string;
  instagram?: string;
  hero: string;
  images: string[];
  rating: number;
  reviewCount: number;
  highlights: string[];
  services: { title: string; description: string }[];
}

export const PARTNERS: Partner[] = [
  {
    slug: 'paul-marsh-4x4',
    name: 'Paul Marsh 4x4',
    category: 'Services',
    location: 'Cape Town, Western Cape',
    tagline: 'Legendary Overlanding Specialist & Toyota Land Cruiser Expert',
    description: 'Premier overlanding specialist with 35+ years of experience in vehicle preparation and expedition consulting.',
    longDescription: `Paul Marsh is a legendary figure in the overlanding world, with over 35 years of hands-on experience building and preparing Toyota Land Cruisers for the most demanding expeditions on earth. A Camel Trophy veteran, Paul has led expeditions from Siberia to the Taklamakan Desert, and completed an 18-month, 70,000 km journey across Africa in the 1980s.\n\nToday, Paul Marsh 4x4 builds custom Land Cruisers for private overlanders, expedition operators, and corporate clients — vehicles that are purpose-built for the African bush and beyond. Every build combines Paul's mechanical engineering background with decades of hard-won field experience.`,
    email: 'info@paulmarsh4x4.com',
    website: 'https://paulmarsh4x4.com',
    hero: 'https://pub-6c900fb2e73a4b89bc049099101e4591.r2.dev/images/partners/paul-marsh/paul-marsh-expedition-27.jpg',
    images: [
      'https://pub-6c900fb2e73a4b89bc049099101e4591.r2.dev/images/partners/paul-marsh/paul-marsh-ruaha-tanzania.jpg',
      'https://pub-6c900fb2e73a4b89bc049099101e4591.r2.dev/images/partners/paul-marsh/paul-marsh-expedition-36.jpg',
      'https://pub-6c900fb2e73a4b89bc049099101e4591.r2.dev/images/partners/paul-marsh/paul-marsh-expedition-46.jpg',
      'https://pub-6c900fb2e73a4b89bc049099101e4591.r2.dev/images/partners/paul-marsh/paul-marsh-interior-29.jpg',
      'https://pub-6c900fb2e73a4b89bc049099101e4591.r2.dev/images/partners/paul-marsh/paul-marsh-interior-01.jpg',
    ],
    rating: 5,
    reviewCount: 47,
    highlights: ['35+ Years Experience', 'Camel Trophy Veteran', 'Custom Land Cruiser Builds', 'Expedition Consulting'],
    services: [
      {
        title: 'Custom Vehicle Builds',
        description: 'Bespoke Toyota Land Cruiser builds tailored to your expedition requirements — custom interiors, reliability upgrades, and safety systems.',
      },
      {
        title: 'Expedition Planning',
        description: 'End-to-end route planning, logistics, permits, resupply strategies, and emergency response protocols for African expeditions.',
      },
      {
        title: 'Training & Consulting',
        description: '4x4 driving technique, vehicle recovery, equipment selection, and pre-departure preparation for first-timers and seasoned overlanders alike.',
      },
      {
        title: 'Fleet Preparation',
        description: 'Full fleet management and preparation services for safari operators — servicing, upgrades, and reliability assessments.',
      },
    ],
  },
  {
    slug: 'manjaro-industries',
    name: 'Manjaro Industries',
    category: 'Services',
    location: 'Cape Town, Western Cape',
    tagline: 'Premium Custom 4x4 Fabrication & Overland Conversions',
    description: 'Cape Town-based fabrication specialists creating bespoke overland vehicle conversions with aluminium storage systems and full living space solutions.',
    longDescription: `Manjaro Industries is Cape Town's premier custom fabrication shop for overland vehicles. Specialising in Toyota Land Cruiser Troopy conversions, the team designs and builds bespoke modular living systems — from aluminium drawer systems and cabinetry to full off-grid electrical and water integration.\n\nEvery Manjaro build is designed around the way you actually travel. Whether you need a weekend warrior setup or a fully self-sufficient expedition vehicle capable of months in the bush, Manjaro Industries delivers precision fabrication that's built to last. Featured by Expedition Portal and 4XOverland, and the preferred fabricator of Paul Marsh 4x4.`,
    email: 'info@manjaroindustries.co.za',
    website: 'https://manjaroindustries.co.za',
    instagram: 'manjaroindustries',
    hero: 'https://pub-6c900fb2e73a4b89bc049099101e4591.r2.dev/images/partners/manjaro/manjaro-hero-camping.jpg',
    images: [
      'https://pub-6c900fb2e73a4b89bc049099101e4591.r2.dev/images/partners/manjaro/manjaro-storage-system.jpg',
      'https://pub-6c900fb2e73a4b89bc049099101e4591.r2.dev/images/partners/manjaro/manjaro-solar-setup.jpg',
      'https://pub-6c900fb2e73a4b89bc049099101e4591.r2.dev/images/partners/manjaro/manjaro-aluminum-panels.jpg',
      'https://pub-6c900fb2e73a4b89bc049099101e4591.r2.dev/images/partners/manjaro/manjaro-camping-setup.jpg',
    ],
    rating: 4.8,
    reviewCount: 73,
    highlights: ['Custom Fabrication', 'Aluminium Systems', 'Off-Grid Integration', 'Troopy Specialists'],
    services: [
      {
        title: 'Custom Interior Conversions',
        description: 'Modular furniture, convertible seating, and integrated living systems designed for long-distance overlanding comfort.',
      },
      {
        title: 'Aluminium Storage Systems',
        description: 'Custom-built aluminium drawers, cupboards, and compartments — lightweight, strong, and precisely fitted to your vehicle.',
      },
      {
        title: 'Electrical & Water Integration',
        description: 'Solar panels, lithium battery banks, MPPT controllers, fresh and grey water systems — fully integrated and professionally wired.',
      },
      {
        title: 'Roof Racks & External Systems',
        description: 'Custom roof racks, awning mounts, recovery point integration, and external storage solutions.',
      },
    ],
  },
  {
    slug: 'routes-rediscovered',
    name: 'Routes Rediscovered',
    category: 'Tours',
    location: 'Cape Town, Western Cape',
    tagline: 'Premium African Overlanding Expeditions & Self-Drive Safaris',
    description: 'Transformative overlanding expeditions and self-drive safaris across Southern and East Africa, combining expert planning with authentic African experiences.',
    longDescription: `Routes Rediscovered was founded by Mark Bland — a South African with deep roots in hospitality, culinary arts, and adventure travel. The company designs and operates premium overlanding expeditions and self-drive safaris across 14+ African countries, from the dunes of Namibia to the gorillas of Rwanda.\n\nWhether you want a fully hosted expedition with expert guides and luxury camping, or a carefully planned self-drive route with 24/7 backup support, Routes Rediscovered delivers an experience that goes far beyond the typical safari. Winners of the TripAdvisor Certificate of Excellence and a member of the African Travel Association.`,
    email: 'hello@routesrediscovered.co.za',
    website: 'https://routesrediscovered.co.za',
    hero: 'https://pub-6c900fb2e73a4b89bc049099101e4591.r2.dev/images/partners/routes-rediscovered/routes-rediscovered-hero.webp',
    images: [
      'https://pub-6c900fb2e73a4b89bc049099101e4591.r2.dev/images/partners/routes-rediscovered/routes-rediscovered-sossusvlei.webp',
      'https://pub-6c900fb2e73a4b89bc049099101e4591.r2.dev/images/partners/routes-rediscovered/routes-rediscovered-elephant.webp',
      'https://pub-6c900fb2e73a4b89bc049099101e4591.r2.dev/images/partners/routes-rediscovered/routes-rediscovered-elephants.webp',
      'https://pub-6c900fb2e73a4b89bc049099101e4591.r2.dev/images/partners/routes-rediscovered/routes-rediscovered-landscape.webp',
      'https://pub-6c900fb2e73a4b89bc049099101e4591.r2.dev/images/partners/routes-rediscovered/routes-rediscovered-baobab.webp',
      'https://pub-6c900fb2e73a4b89bc049099101e4591.r2.dev/images/partners/routes-rediscovered/routes-rediscovered-railway.webp',
    ],
    rating: 5,
    reviewCount: 89,
    highlights: ['14+ African Countries', 'Expert Planning', 'Self-Drive & Hosted', '5-Star Rated'],
    services: [
      {
        title: 'Self-Drive 4x4 Safaris',
        description: 'Comprehensive self-drive packages including detailed route planning, vehicle hire, camping gear, and 24/7 satellite support.',
      },
      {
        title: 'Hosted Expeditions',
        description: 'Small-group expeditions led by expert guides, with luxury bush camping, all-inclusive catering, and full logistics handled.',
      },
      {
        title: 'Overlanding Consulting',
        description: 'Route advice, supplier networks, border crossing permits, and emergency support protocols for independent overlanders.',
      },
      {
        title: 'Mobile Camping',
        description: 'Professional mobile camp setups in spectacular African locations — from desert dunes to riverine forests.',
      },
    ],
  },
  {
    slug: 'toyota-gazoo-racing-driving-academy',
    name: 'Toyota Gazoo Racing Driving Academy',
    category: 'Training',
    location: 'Zwartkops Raceway, Gauteng',
    tagline: 'Professional Off-Road Driving Courses on Toyota Vehicles',
    description: 'Comprehensive 4x4 driving courses from basic vehicle dynamics to advanced recovery techniques — using Toyota\'s latest vehicles at Zwartkops and De Wildt.',
    longDescription: `The Toyota Gazoo Racing Driving Academy is South Africa's premier manufacturer-backed 4x4 training programme. Held at Zwartkops Raceway and the De Wildt off-road facility, the academy offers full-day courses that cover everything from off-road vehicle dynamics and terrain reading to advanced winching and self-recovery techniques.\n\nWith a maximum of 8 drivers per course and expert Toyota-trained instructors, you'll spend 70% of the day on practical terrain — steep ascents, rock crawling, mud, sand, and water crossings. Every participant leaves with a certificate, TAD cap, and the skills to handle whatever the African bush throws at them. R4,250 per person, VAT included, with breakfast and lunch provided.`,
    email: 'training@landcruisersa.co.za',
    website: 'https://landcruisersa.co.za/training/',
    hero: 'https://pub-6c900fb2e73a4b89bc049099101e4591.r2.dev/images/partners/toyota-gazoo/toyota-gazoo-hero.webp',
    images: [
      'https://pub-6c900fb2e73a4b89bc049099101e4591.r2.dev/images/partners/toyota-gazoo/toyota-gazoo-mud.webp',
      'https://pub-6c900fb2e73a4b89bc049099101e4591.r2.dev/images/partners/toyota-gazoo/toyota-gazoo-hilux.webp',
      'https://pub-6c900fb2e73a4b89bc049099101e4591.r2.dev/images/partners/toyota-gazoo/toyota-gazoo-steep.webp',
      'https://pub-6c900fb2e73a4b89bc049099101e4591.r2.dev/images/partners/toyota-gazoo/toyota-gazoo-rocks.webp',
    ],
    rating: 4.9,
    reviewCount: 156,
    highlights: ['Toyota Vehicles', 'Max 8 Drivers', 'Zwartkops & De Wildt', 'R4,250 p.p.'],
    services: [
      {
        title: 'Full-Day 4x4 Course',
        description: 'A complete day of theory and practical training covering all major off-road terrains and techniques. 08:00–16:30.',
      },
      {
        title: 'Advanced Recovery Techniques',
        description: 'Hands-on winching, high-lift jack use, traction boards, and multi-vehicle recovery — essential skills for remote travel.',
      },
      {
        title: 'Terrain Reading & Vehicle Dynamics',
        description: 'Theory sessions on understanding terrain, tyre pressures, diff locks, and how your vehicle behaves in challenging conditions.',
      },
      {
        title: 'Corporate & Group Training',
        description: 'On-site corporate team training available — bring the course to your location with a minimum group of 8 drivers.',
      },
    ],
  },
  {
    slug: 'igl-coatings-africa',
    name: 'IGL Coatings Africa',
    category: 'Services',
    location: 'Cape Town, Western Cape',
    tagline: 'Official IGL Coatings Importer & Distributor for Southern Africa',
    description: 'Premium ceramic coating products and applicator training for Land Cruisers and overland vehicles — protecting your investment against the elements.',
    longDescription: `IGL Coatings Africa is the exclusive official importer and distributor of IGL Coatings products for Southern Africa. IGL is a global leader in graphene-nanotechnology ceramic coatings, trusted by professional detailers and vehicle enthusiasts worldwide for outstanding paint protection, hydrophobic performance, and long-term durability.\n\nFor Land Cruiser owners, a quality ceramic coating is one of the best investments you can make — protecting paintwork from UV damage, red dust, tree sap, bird droppings, and the harsh African bush environment that overlanding inevitably brings. IGL's product range covers everything from entry-level DIY kits to professional-grade coatings applied by certified detailers.\n\nIGL Coatings Africa also provides training and certification for detailing professionals across Southern Africa, and maintains a network of authorised applicators who can prep and coat your vehicle to factory-grade standards.`,
    website: 'https://iglcoatings.africa/',
    instagram: 'iglcoatings.africa',
    hero: 'https://pub-6c900fb2e73a4b89bc049099101e4591.r2.dev/images/partners/igl/igl-lc200-bushveld.webp',
    images: [
      'https://pub-6c900fb2e73a4b89bc049099101e4591.r2.dev/images/partners/igl/igl-troopy-coast.webp',
      'https://pub-6c900fb2e73a4b89bc049099101e4591.r2.dev/images/partners/igl/igl-hilux-river.webp',
      'https://pub-6c900fb2e73a4b89bc049099101e4591.r2.dev/images/partners/igl/igl-ceramic-droplets.webp',
    ],
    rating: 5,
    reviewCount: 31,
    highlights: ['Graphene Nanotechnology', 'Certified Applicators', 'UV & Bush Protection', 'SA Exclusive Distributor'],
    services: [
      {
        title: 'Ceramic Coating Products',
        description: 'Full range of IGL ceramic coating products — from professional-grade Kenzo and Quartz to entry-level Mohs kits for DIY enthusiasts.',
      },
      {
        title: 'Authorised Applicator Network',
        description: 'Find a certified IGL applicator near you — trained professionals who prep and apply coatings to exacting standards.',
      },
      {
        title: 'Detailer Training & Certification',
        description: 'Professional detailer training programmes to become an IGL-certified applicator — covering surface prep, coating application, and aftercare.',
      },
      {
        title: 'Overland Vehicle Protection',
        description: 'Tailored coating solutions for overlanders — protecting rooftops, bonnets, and body panels from UV, dust, and environmental damage on extended trips.',
      },
    ],
  },
];
