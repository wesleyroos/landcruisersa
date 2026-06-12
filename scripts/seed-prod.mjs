import Database from 'better-sqlite3';

const db = new Database(process.env.DATABASE_PATH ?? '/data/db.sqlite');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const insert = db.prepare(`
  INSERT OR IGNORE INTO listings
    (slug, listing_type, title, model, year, price, mileage, province, new_or_used,
     transmission, colour, description, photos, seller_name, seller_email, seller_phone,
     status, fuel_type, fuel_consumption, power_kw, seats, co2, source_url, created_at)
  VALUES
    (@slug, @listing_type, @title, @model, @year, @price, @mileage, @province, @new_or_used,
     @transmission, @colour, @description, @photos, @seller_name, @seller_email, @seller_phone,
     @status, @fuel_type, @fuel_consumption, @power_kw, @seats, @co2, @source_url, @created_at)
`);

const seed = db.transaction((rows) => { for (const r of rows) insert.run(r); });

seed([
  {
    slug: '2025-lc76-28568296', listing_type: 'for_sale',
    title: '2025 Toyota Land Cruiser 76 2.8GD-6 Station Wagon LX',
    model: '76-series', year: 2025, price: 1099900, mileage: 46500,
    province: 'Gauteng', new_or_used: 'Used', transmission: 'manual', colour: 'Beige',
    fuel_type: 'Diesel', fuel_consumption: 7.7, power_kw: 150, seats: 5, co2: 201,
    description: 'Meticulously maintained 2025 LC76 Station Wagon LX with full service history and factory warranty still intact (19 months or 53,500 km remaining). One owner from new. The 2.8GD-6 turbo diesel makes 150 kW and 450 Nm with a claimed 7.7 l/100km fuel consumption and a massive 130L tank — good for nearly 1,700 km on a tank. This is the current-generation 76 with updated interior and the latest 2.8L engine. All original, no modifications. Dealer maintained and ready to go.',
    photos: JSON.stringify(['https://img.autotrader.co.za/47713484','https://img.autotrader.co.za/47713478','https://img.autotrader.co.za/47713397','https://img.autotrader.co.za/47713379','https://img.autotrader.co.za/47713283']),
    seller_name: 'Chery Boksburg', seller_email: 'info@landcruisersa.co.za', seller_phone: '011 000 0000',
    status: 'active', source_url: 'https://www.autotrader.co.za/car-for-sale/toyota/land-cruiser-76/2.8/28568296',
    created_at: Math.floor(new Date('2026-06-01').getTime() / 1000),
  },
  {
    slug: '2025-lc76-28581952', listing_type: 'for_sale',
    title: '2025 Toyota Land Cruiser 76 2.8GD-6 Station Wagon LX',
    model: '76-series', year: 2025, price: 999900, mileage: 36000,
    province: 'North West', new_or_used: 'Used', transmission: 'manual', colour: 'White',
    fuel_type: 'Diesel', fuel_consumption: 7.7, power_kw: 150, seats: 5, co2: 201,
    description: "Current-generation LC76 Station Wagon LX in white with only 36,000 km. Full franchise service history and 24 months or 64,000 km warranty remaining. The proven 2.8L turbo diesel delivers 150 kW, 450 Nm and the kind of reliability that's made the 76 Series a legend in the African bush. Full 130L fuel tank for serious range. This is a rugged, low-risk choice — a capable workhorse equally at home on a farm track or the Kalahari.",
    photos: JSON.stringify(['https://img.autotrader.co.za/47587031','https://img.autotrader.co.za/47586968','https://img.autotrader.co.za/47587041','https://img.autotrader.co.za/47586964','https://img.autotrader.co.za/47587010']),
    seller_name: 'Auto Den Flamwood', seller_email: 'info@landcruisersa.co.za', seller_phone: '018 000 0000',
    status: 'active', source_url: 'https://www.autotrader.co.za/car-for-sale/toyota/land-cruiser-76/2.8/28581952',
    created_at: Math.floor(new Date('2026-06-02').getTime() / 1000),
  },
  {
    slug: '2019-lc76-28518691', listing_type: 'for_sale',
    title: '2019 Toyota Land Cruiser 76 4.5D-4D V8 Station Wagon — Full Build',
    model: '76-series', year: 2019, price: 959950, mileage: 72212,
    province: 'Gauteng', new_or_used: 'Used', transmission: 'manual', colour: 'White',
    fuel_type: 'Diesel', fuel_consumption: 11.6, power_kw: 151, seats: 5, co2: 306,
    description: "V8-powered LC76 Station Wagon with a comprehensive overland build done right. Onca front bumper with integrated winch and spotlights, GR grille upgrade, ARB twin-piston compressor, FOX suspension lift, LAS snorkel, Gobi-X rear bumper, Alu Cab awning and roof rack with all the rails. Leather inserts, JVC head unit, reverse camera. Two previous owners — full franchise service history throughout. The 4.5L V8 makes 151 kW and 430 Nm with a characteristic V8 soundtrack. 72,000 km is barely run-in for this engine. Everything works, everything is quality. Drive away and explore Africa.",
    photos: JSON.stringify(['https://img.autotrader.co.za/46553993','https://img.autotrader.co.za/46553994','https://img.autotrader.co.za/46554024','https://img.autotrader.co.za/46554101','https://img.autotrader.co.za/46554053']),
    seller_name: 'Penta Now Centurion', seller_email: 'info@landcruisersa.co.za', seller_phone: '012 000 0000',
    status: 'active', source_url: 'https://www.autotrader.co.za/car-for-sale/toyota/land-cruiser-76/4.5/28518691',
    created_at: Math.floor(new Date('2026-05-28').getTime() / 1000),
  },
  {
    slug: '2017-prado-28586552', listing_type: 'for_sale',
    title: '2017 Toyota Land Cruiser Prado 3.0DT TX',
    model: 'prado-150', year: 2017, price: 499950, mileage: 201000,
    province: 'Gauteng', new_or_used: 'Used', transmission: 'automatic', colour: 'White',
    fuel_type: 'Diesel', fuel_consumption: 8.5, power_kw: 120, seats: 7, co2: 226,
    description: 'High-mileage Prado 150 TX priced accordingly. 3.0DT diesel making 120 kW mated to the automatic gearbox. Well-equipped for its age: xenon headlights, nudge bar, powered and heated seats (front and middle row), touchscreen infotainment with USB, cruise control, reverse camera, rear PDC, and factory diff lock. Partial service history — worth a thorough inspection before purchase. 7-seat configuration. At this price, a solid entry point into Prado ownership if you know your way around a spanner.',
    photos: JSON.stringify(['https://img.autotrader.co.za/47663588','https://img.autotrader.co.za/47663589','https://img.autotrader.co.za/47663595','https://img.autotrader.co.za/47663597','https://img.autotrader.co.za/47663635']),
    seller_name: 'Botha and Deysel Executive Motors', seller_email: 'info@landcruisersa.co.za', seller_phone: '016 000 0000',
    status: 'active', source_url: 'https://www.autotrader.co.za/car-for-sale/toyota/land-cruiser-prado/tx/28586552',
    created_at: Math.floor(new Date('2026-06-03').getTime() / 1000),
  },
  {
    slug: '2020-lc200-28583974', listing_type: 'for_sale',
    title: '2020 Toyota Land Cruiser 200 4.5D-4D V8 VX-R',
    model: '200-series', year: 2020, price: 1229900, mileage: 142520,
    province: 'Gauteng', new_or_used: 'Used', transmission: 'automatic', colour: 'White',
    fuel_type: 'Diesel', fuel_consumption: 10.2, power_kw: 195, seats: 7, co2: 270,
    description: "Top-spec 200 Series VX-R with the twin-turbo 4.5L V8 diesel making 195 kW. Full franchise service history. 142,000 km on the clock — properly serviced examples of this engine regularly go past 400,000 km. 7-seat configuration with full leather, climate control across all three rows, satellite navigation, auto-dimming mirror, and towbar. ABS, multiple airbags, KDSS, crawl control, and multi-terrain select. A flagship Land Cruiser at a sub-flagship price — these VX-Rs are becoming increasingly hard to find at this age in this condition.",
    photos: JSON.stringify(['https://img.autotrader.co.za/47623285','https://img.autotrader.co.za/47623286','https://img.autotrader.co.za/47623287','https://img.autotrader.co.za/47623288','https://img.autotrader.co.za/47623289']),
    seller_name: 'Gys Pitzer Motors', seller_email: 'info@landcruisersa.co.za', seller_phone: '012 000 0001',
    status: 'active', source_url: 'https://www.autotrader.co.za/car-for-sale/toyota/land-cruiser-200/vx/28583974',
    created_at: Math.floor(new Date('2026-06-03').getTime() / 1000),
  },
  {
    slug: '2026-fj-28590629', listing_type: 'for_sale',
    title: '2026 Toyota Land Cruiser FJ 2.7 4x4 GX',
    model: 'land-cruiser-fj', year: 2026, price: 789800, mileage: 200,
    province: 'KwaZulu-Natal', new_or_used: 'Used', transmission: 'automatic', colour: 'Silver',
    fuel_type: 'Petrol', fuel_consumption: 10.7, power_kw: 122, seats: 5, co2: 256,
    description: "Essentially brand new 2026 Land Cruiser FJ GX with only 200 km on the clock. Full factory warranty of 100,000 km remaining. The FJ runs the 2.7L naturally-aspirated petrol making 122 kW and 245 Nm mated to a 6-speed automatic. This is the entry-level GX trim — clean and capable, with Toyota's proven 4x4 system and the iconic FJ character. 63L fuel tank. Full 120-point dealer inspection completed. First registered 2026 so you get the full warranty period. If you missed out on new, this is the next best thing.",
    photos: JSON.stringify(['https://img.autotrader.co.za/47730818','https://img.autotrader.co.za/47730803','https://img.autotrader.co.za/47730814','https://img.autotrader.co.za/47730805','https://img.autotrader.co.za/47730807']),
    seller_name: 'Heyhalfway Hillcrest', seller_email: 'info@landcruisersa.co.za', seller_phone: '031 000 0000',
    status: 'active', source_url: 'https://www.autotrader.co.za/car-for-sale/toyota/land-cruiser-fj/2.7/28590629',
    created_at: Math.floor(new Date('2026-06-04').getTime() / 1000),
  },
  {
    slug: '2026-fj-28587857', listing_type: 'for_sale',
    title: '2026 Toyota Land Cruiser FJ 2.7 4x4 VX',
    model: 'land-cruiser-fj', year: 2026, price: 849990, mileage: 292,
    province: 'KwaZulu-Natal', new_or_used: 'Used', transmission: 'automatic', colour: 'White',
    fuel_type: 'Petrol', fuel_consumption: 10.7, power_kw: 122, seats: 5, co2: 256,
    description: "Brand new 2026 Land Cruiser FJ VX with 292 km on the odometer — factory fresh with a 36-month / 99,708 km warranty still to run. Top VX spec brings leather interior, 360° camera, adaptive cruise control, front and rear PDC, 18\" alloy wheels, side steps, roof rails, fold-in mirrors, climate control, and USB-C charging throughout. The 2.7L petrol and 6-speed auto is smooth and refined, with proper Toyota 4x4 running gear underneath. One of the first VXs available in KZN. White on black trim.",
    photos: JSON.stringify(['https://img.autotrader.co.za/47684637','https://img.autotrader.co.za/47684639','https://img.autotrader.co.za/47684641','https://img.autotrader.co.za/47684642','https://img.autotrader.co.za/47684643']),
    seller_name: 'Auto Investments North Coast', seller_email: 'info@landcruisersa.co.za', seller_phone: '032 000 0000',
    status: 'active', source_url: 'https://www.autotrader.co.za/car-for-sale/toyota/land-cruiser-fj/2.7/28587857',
    created_at: Math.floor(new Date('2026-06-04').getTime() / 1000),
  },
  {
    slug: '2015-lc79-28587192', listing_type: 'for_sale',
    title: '2015 Toyota Land Cruiser 79 4.5D-4D V8 Double Cab',
    model: '79-series', year: 2015, price: 804999, mileage: 189150,
    province: 'KwaZulu-Natal', new_or_used: 'Used', transmission: 'manual', colour: 'White',
    fuel_type: 'Diesel', fuel_consumption: 11.6, power_kw: 151, seats: 5, co2: 306,
    description: 'Well-built V8 79 Series Double Cab with full service history and a full Dekra roadworthy. 189,000 km from two owners — low for a V8 79 at this age. Bull bar, winch, canopy, roof rack, running boards, Bluetooth, ARB alloy rims, suspension upgrades, towbar and four new Patriot Rugged terrain tyres just fitted. Air conditioning. The 4.5L V8 diesel with 151 kW is the benchmark engine for the 79 — effortless power, bullet-proof reliability, and that unmistakable V8 note. This one has been maintained and is ready to work.',
    photos: JSON.stringify(['https://img.autotrader.co.za/47514780','https://img.autotrader.co.za/47514758','https://img.autotrader.co.za/47514749','https://img.autotrader.co.za/47514773','https://img.autotrader.co.za/47514753']),
    seller_name: 'Kloof Car Sales', seller_email: 'info@landcruisersa.co.za', seller_phone: '031 000 0001',
    status: 'active', source_url: 'https://www.autotrader.co.za/car-for-sale/toyota/land-cruiser-79/4.5/28587192',
    created_at: Math.floor(new Date('2026-05-30').getTime() / 1000),
  },
  {
    slug: '2026-lc79-28587583', listing_type: 'for_sale',
    title: '2026 Toyota Land Cruiser 79 4.0 V6 Double Cab',
    model: '79-series', year: 2026, price: 949900, mileage: 15400,
    province: 'North West', new_or_used: 'Used', transmission: 'manual', colour: 'Beige',
    fuel_type: 'Petrol', fuel_consumption: 14.4, power_kw: 170, seats: 5, co2: 343,
    description: "Immaculate 2026 LC79 Double Cab V6 petrol with 15,400 km and 32 months or 84,600 km of factory warranty remaining. One owner from new, full franchise service history. The 4.0L V6 makes 170 kW and has the kind of free-revving character that pairs perfectly with the 79's tough manual gearbox. Low range transfer case and diff lock as standard. Towbar-ready. This is the new-generation V6 petrol 79 — a slightly different flavour to the V8 diesel but just as capable in the field, and more fuel-friendly on road. Beige is the iconic bush colour.",
    photos: JSON.stringify(['https://img.autotrader.co.za/47679923','https://img.autotrader.co.za/47679892','https://img.autotrader.co.za/47679972','https://img.autotrader.co.za/47679932','https://img.autotrader.co.za/47680042']),
    seller_name: 'Autorama Klerksdorp', seller_email: 'info@landcruisersa.co.za', seller_phone: '018 000 0001',
    status: 'active', source_url: 'https://www.autotrader.co.za/car-for-sale/toyota/land-cruiser-79/4.0/28587583',
    created_at: Math.floor(new Date('2026-06-05').getTime() / 1000),
  },
  {
    slug: '2024-prado-28572116', listing_type: 'for_sale',
    title: '2024 Toyota Land Cruiser Prado 250 2.8GD TX',
    model: 'prado-250', year: 2024, price: 1169950, mileage: 45460,
    province: 'Gauteng', new_or_used: 'Used', transmission: 'automatic', colour: 'White',
    fuel_type: 'Diesel', fuel_consumption: 7.9, power_kw: 150, seats: 7, co2: 209,
    description: "First-year Prado 250 Series TX in excellent condition with 45,460 km and 18 months or 54,540 km warranty remaining. One owner, full franchise service history. The all-new 250 brings a completely redesigned interior with a vastly improved infotainment system, a 2.8L turbo diesel making 150 kW and 500 Nm, and a modern automatic transmission. Seven seats, climate control, cruise control, reverse camera. This is the TX spec — properly equipped without being ostentatious. The 250 Series represents a genuine leap over the 150 in interior quality and on-road refinement while keeping the Prado's iconic off-road ability.",
    photos: JSON.stringify(['https://img.autotrader.co.za/46181047','https://img.autotrader.co.za/46181134','https://img.autotrader.co.za/46181071','https://img.autotrader.co.za/46181157','https://img.autotrader.co.za/46181059']),
    seller_name: 'Penta Now Centurion', seller_email: 'info@landcruisersa.co.za', seller_phone: '012 000 0002',
    status: 'active', source_url: 'https://www.autotrader.co.za/car-for-sale/toyota/land-cruiser-prado/tx/28572116',
    created_at: Math.floor(new Date('2026-06-05').getTime() / 1000),
  },
]);

console.log('[seed] 10 listings inserted.');
db.close();
