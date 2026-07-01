// Refresh cached Google ratings for the rental operators cited in the guides.
// Uses the Google Places API (New) Text Search, writes src/data/operator-ratings.json,
// which the OperatorRating.astro component bakes into the (static, crawlable) guide
// HTML on the next build. Run weekly (cron / cloud routine) then commit + push:
//
//   node scripts/refresh-operator-ratings.mjs
//
// Requires GOOGLE_PLACES_API_KEY in .env (Places API "New" enabled + billing).
import fs from 'node:fs';

const env = fs.existsSync('.env')
  ? Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n')
      .filter(l => l && !l.startsWith('#') && l.includes('='))
      .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }))
  : {};
const KEY = env.GOOGLE_PLACES_API_KEY ?? process.env.GOOGLE_PLACES_API_KEY;
if (!KEY) { console.error('Missing GOOGLE_PLACES_API_KEY (add it to .env).'); process.exit(1); }

// slug → the text query that best identifies the operator's Google Business place.
// Tighten a query here if it resolves to the wrong place.
const OPERATORS = [
  { slug: 'kampi',     query: 'Kampi camper and caravan rental South Africa' },
  { slug: 'conqueror', query: 'Conqueror Off Road Campers Johannesburg' },
  { slug: 'kubu-4x4',  query: 'Kubu4x4 Caravan and Trailer Rentals Krugersdorp' },
  { slug: 'go-camp',   query: 'Go Camp Gauteng Midrand camping' },
  { slug: 'campezi',   query: 'CampEzi Off-Road Trailer Rentals Pretoria' },
  { slug: 'bundu',     query: 'Bundu 4x4 Caravan and Trailer Hire' },
  { slug: 'camp-guru', query: 'Camp Guru Caravan and Trailer Rental Edenvale' },
];

const FILE = 'src/data/operator-ratings.json';
const data = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const today = new Date().toISOString().slice(0, 10);

for (const op of OPERATORS) {
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.rating,places.userRatingCount',
      },
      body: JSON.stringify({ textQuery: op.query, regionCode: 'ZA' }),
    });
    const j = await res.json();
    if (j.error) { console.log(`✗ ${op.slug}: API error — ${j.error.message}`); continue; }
    const p = j.places && j.places[0];
    if (!p || typeof p.rating !== 'number') { console.log(`✗ ${op.slug}: no rating found`); continue; }
    data[op.slug] = {
      rating: p.rating,
      reviewCount: p.userRatingCount ?? null,
      name: p.displayName?.text ?? op.slug,
      placeId: p.id ?? null,
      updated: today,
    };
    console.log(`✓ ${op.slug}: ${p.rating}★ (${p.userRatingCount ?? '?'}) — ${p.displayName?.text ?? ''}`);
  } catch (e) {
    console.log(`✗ ${op.slug}: ${e.message}`);
  }
}

fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
console.log(`\nWrote ${FILE}. Commit + push to deploy the refreshed ratings.`);
