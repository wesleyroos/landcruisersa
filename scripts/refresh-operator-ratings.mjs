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

// Operators pinned by Google place_id (resolved + name-verified once), so a
// refresh always reads the SAME business and can't drift to a competitor via
// fuzzy text search. Add a new operator with { slug, query } and the script will
// resolve + print its place_id to paste back here.
// NOTE: Kampi (an online platform) and CampEzi have no location-based Google
// Business listing, so they're intentionally omitted — they show no badge.
const OPERATORS = [
  { slug: 'conqueror', placeId: 'ChIJvcaT09l1lR4R9SnCTS7zly4', query: 'Conqueror Northgate Johannesburg' },
  { slug: 'kubu-4x4',  placeId: 'ChIJ62L2yxqZlR4RcVqGmi0vAhI', query: 'Kubu4x4 Caravan and Trailer Rentals Krugersdorp' },
  { slug: 'go-camp',   placeId: 'ChIJnz3gW74VlR4RdP42UJYXtf4', query: 'Go Camp Gauteng Midrand' },
  { slug: 'bundu',     placeId: 'ChIJG1FW-XMrvh4RGA_RDQhjspA', query: 'Bundu Trailers & Caravans Hartbeespoort' },
  { slug: 'camp-guru', placeId: 'ChIJN_cDr5YTlR4RC1IuUHynsE8', query: 'Camp Guru Edenvale' },
];

const FILE = 'src/data/operator-ratings.json';
const data = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const today = new Date().toISOString().slice(0, 10);

// Exact lookup by place_id (stable); falls back to text search only when a new
// operator has no place_id yet (then paste the printed id into OPERATORS).
async function lookup(op) {
  if (op.placeId) {
    const res = await fetch(`https://places.googleapis.com/v1/places/${op.placeId}`, {
      headers: { 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': 'id,displayName,rating,userRatingCount' },
    });
    const p = await res.json();
    if (p.error) throw new Error(p.error.message);
    return p;
  }
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.rating,places.userRatingCount' },
    body: JSON.stringify({ textQuery: op.query, regionCode: 'ZA' }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message);
  return (j.places && j.places[0]) || null;
}

for (const op of OPERATORS) {
  try {
    const p = await lookup(op);
    if (!p || typeof p.rating !== 'number') { console.log(`✗ ${op.slug}: no rating found`); continue; }
    data[op.slug] = {
      rating: p.rating,
      reviewCount: p.userRatingCount ?? null,
      name: p.displayName?.text ?? op.slug,
      placeId: p.id ?? op.placeId ?? null,
      updated: today,
    };
    const flag = op.placeId ? '' : `  ← new place_id: ${p.id}`;
    console.log(`✓ ${op.slug}: ${p.rating}★ (${p.userRatingCount ?? '?'}) — ${p.displayName?.text ?? ''}${flag}`);
  } catch (e) {
    console.log(`✗ ${op.slug}: ${e.message}`);
  }
}

fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
console.log(`\nWrote ${FILE}. Commit + push to deploy the refreshed ratings.`);
