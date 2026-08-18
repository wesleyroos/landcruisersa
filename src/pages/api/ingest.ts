export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { listings, priceEvents } from '@/db/schema';
import { and, eq, gt, ne } from 'drizzle-orm';
import { segmentForModel, detectBodyType } from '@/lib/sources/normalize';

// A used vehicle this many model years old with a 0 km reading is a source that
// doesn't publish mileage, not a genuine delivery-mileage car. Below this age,
// 0 km is ordinary new/demo stock — dozens of dealers legitimately list the same
// 2026 79-series at the same list price with 0 km, and treating those as
// duplicates of each other would gut the new-vehicle side of the site.
const MILEAGE_HOLE_MIN_AGE = 3;

// Engine displacement as written in a listing title ("4.5 GX", "2.8GD-6", "4.0 V6").
// This is the tiebreak when mileage can't be one: two variants of a model often
// share a list price to the rand. A 2021 Prado "2.8 GD VX-L" and a 2021 Prado
// "4.0 V6 VX-L" both listed at R909,900 are two different cars.
function displacement(title: string): string | null {
  const m = title.match(/\b([1-9])\.(\d)(?!\d)/);
  return m ? `${m[1]}.${m[2]}` : null;
}

// Cross-source dedupe: the same physical car often appears on multiple portals
// (a WeBuyCars unit on both webuycars.co.za and cars.co.za; a classics dealer's
// stock on both its own website and AutoTrader). Returns the listing this one
// duplicates, or null.
//
// Matching on year + model + price + mileage is the strong form and stays the
// default. It could never fire for a source that publishes no mileage at all,
// though — Vintage Cars SA sends mileage 0 on every car, so four of its classics
// sat on the site alongside the same dealer's AutoTrader ads for the same cars
// (the FJ60 at R450,000, the FJ62 at R399,000, the 80 GX at R499,000, the 70 EFI
// at R750,000; found 2026-08-18). For those the mileage is dropped from the key
// and two narrow guards take its place: the car must be old enough that 0 km is
// a data hole, and the match must be against a row that DOES carry mileage, so
// the zero-mileage row is always the one suppressed. That direction is what keeps
// this from flapping between two rows of the same car on alternating crawls.
async function findCrossSourceDuplicate(v: {
  source: string; year: number; model: string; price: number;
  mileage: number; new_or_used: string; title: string;
}): Promise<{ id: number; slug: string } | null> {
  if (!(v.price > 0)) return null;

  const sameCar = [
    eq(listings.status, 'active'),
    eq(listings.year, v.year),
    eq(listings.model, v.model),
    eq(listings.price, v.price),
    ne(listings.source, v.source),
  ];

  if (v.mileage > 0) {
    const [dup] = await db.select({ id: listings.id, slug: listings.slug })
      .from(listings)
      .where(and(...sameCar, eq(listings.mileage, v.mileage)))
      .limit(1);
    return dup ?? null;
  }

  if (v.new_or_used !== 'Used') return null;
  if (v.year > new Date().getFullYear() - MILEAGE_HOLE_MIN_AGE) return null;

  const candidates = await db.select({ id: listings.id, slug: listings.slug, title: listings.title })
    .from(listings)
    .where(and(...sameCar, gt(listings.mileage, 0)))
    .limit(5);

  const mine = displacement(v.title);
  const dup = candidates.find(c => {
    const theirs = displacement(c.title);
    return !(mine && theirs && mine !== theirs);
  });
  return dup ? { id: dup.id, slug: dup.slug } : null;
}

function slugify(str: string) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function checkToken(request: Request): boolean {
  const auth = request.headers.get('authorization') ?? '';
  const token = import.meta.env.INGEST_TOKEN ?? process.env.INGEST_TOKEN;
  if (!token) return false;
  return auth === `Bearer ${token}`;
}

export const POST: APIRoute = async ({ request }) => {
  if (!checkToken(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const {
    source, source_id, source_url,
    title, model, year, price, mileage,
    province, new_or_used, transmission, colour,
    description, photos,
    seller_name,
    fuel_type, fuel_consumption, power_kw, seats, co2,
    segment,
  } = body as Record<string, unknown>;

  // Adapter-declared segment override — only known containment segments are
  // accepted (non-Toyota game viewers must never enter the LC classifieds via
  // the model='other' fallthrough). Anything else derives from model as before.
  const segmentOverride = segment === 'other-4x4' ? 'other-4x4' : null;

  if (!source || !source_id || !source_url || !title || !model || !year) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
  }

  const photoJson = JSON.stringify(Array.isArray(photos) ? photos : []);
  const base = slugify(`${year}-${title}`);

  // Upsert by (source, source_id) — update if exists, insert if new.
  // colour/description are pulled so a re-ingest can preserve enriched values when
  // the incoming source carries none (see the coalesce in the update branch below).
  const existing = await db.select({
    id: listings.id, slug: listings.slug, price: listings.price, model: listings.model,
    colour: listings.colour, description: listings.description, photos: listings.photos,
    body_type: listings.body_type, model_locked: listings.model_locked,
  })
    .from(listings)
    .where(and(eq(listings.source, String(source)), eq(listings.source_id, String(source_id))))
    .limit(1);

  if (existing.length > 0) {
    // Record observed price changes — fuels price-trend content and price-drop surfacing
    const newPrice = Number(price ?? 0);
    if (newPrice > 0 && existing[0].price > 0 && newPrice !== existing[0].price) {
      await db.insert(priceEvents).values({
        listing_id:  existing[0].id,
        slug:        existing[0].slug,
        model:       String(model ?? existing[0].model),
        old_price:   existing[0].price,
        new_price:   newPrice,
        recorded_at: new Date(),
      });
    }
    // Preserve the richer gallery on re-ingest (see the photos note in .set() below).
    const incomingPhotos = Array.isArray(photos) ? photos : [];
    let existingPhotoCount = 0;
    try { const p = JSON.parse(existing[0].photos); if (Array.isArray(p)) existingPhotoCount = p.length; } catch { /* keep 0 */ }

    // An admin model verdict beats the classifier: some cars can't be classified
    // from the title (a dealer titled an FJ Cruiser "FJ 62 4.0 Station Wagon";
    // a bare "FJ 4.2" turned out to be a 60-series game viewer). Same idea as
    // the body_type verdict below, but as an explicit flag since model is
    // otherwise re-asserted on every crawl.
    const effectiveModel = existing[0].model_locked ? existing[0].model : String(model);

    // The insert-time dedupe below only ever sees a car once. A source that
    // publishes no mileage was never caught by it, so its duplicates already
    // exist as rows — and this branch re-asserts 'active' on every crawl, which
    // would resurrect them however they were cleaned up. So re-check here.
    // Restricted to the zero-mileage form on purpose: there the loser is always
    // the row missing the mileage, so two crawls can't take turns suppressing
    // each other. Self-healing — if the other portal's ad goes down, the next
    // crawl finds no match and this row returns to 'active'.
    const duplicateOf = Number(mileage ?? 0) === 0
      ? await findCrossSourceDuplicate({
          source: String(source), year: Number(year), model: effectiveModel,
          price: Number(price ?? 0), mileage: 0,
          new_or_used: String(new_or_used ?? 'Used'), title: String(title),
        })
      : null;

    await db.update(listings).set({
      title: String(title),
      model: effectiveModel,
      year: Number(year),
      price: Number(price ?? 0),
      mileage: Number(mileage ?? 0),
      province: String(province ?? ''),
      new_or_used: (new_or_used as 'New' | 'Used') ?? 'Used',
      transmission: (transmission as 'manual' | 'automatic') ?? 'manual',
      // AutoTrader (and adios) search tiles carry NO colour/description — those are
      // filled later by the desc-backfill. Coalesce so a re-ingest never overwrites
      // an enriched value with the empty string a tile sends; otherwise every daily
      // crawl wiped ~6k rows blank and the backfill lost thousands racing AT's limiter.
      colour: String(colour ?? '').trim() ? String(colour) : existing[0].colour,
      description: String(description ?? '').trim() ? String(description) : existing[0].description,
      // Don't let a re-ingest shrink a gallery: AT search tiles expose ~1 image, but
      // the image-backfill fills (and rehosts to R2) the full set. Keep the larger
      // existing gallery so daily crawls stop reverting it to the tile image — which
      // also stops the rehost re-copying ~33k images to R2 every run.
      photos: incomingPhotos.length > existingPhotoCount ? photoJson : existing[0].photos,
      seller_name: String(seller_name ?? 'Dealer'),
      seller_email: 'info@landcruisersa.co.za',
      seller_phone: '000 000 0000',
      source_url: String(source_url),
      fuel_type: fuel_type ? String(fuel_type) : null,
      fuel_consumption: fuel_consumption ? Number(fuel_consumption) : null,
      power_kw: power_kw ? Number(power_kw) : null,
      seats: seats ? Number(seats) : null,
      co2: co2 ? Number(co2) : null,
      segment: segmentOverride ?? segmentForModel(effectiveModel),
      // Classify only unclassified rows — an admin's manual body_type verdict
      // ('standard' opt-out or confirmed 'game-viewer') survives re-ingest.
      // Weak "safari" phrases are not trusted for other-4x4 bycatch.
      body_type: existing[0].body_type
        ?? detectBodyType(String(title), String(description ?? '').trim() || existing[0].description, segmentOverride !== 'other-4x4'),
      // 'duplicate' deliberately sits outside both OFF_MARKET_STATUSES and
      // ON_MARKET_STATUSES (see lib/listing-status): the car has NOT left the
      // market, it's just already on the site under another portal's row. Using
      // 'removed' here would stamp off_market_at and inject a phantom
      // "delisted today" into the days-on-market and turnover insights.
      status: duplicateOf ? 'duplicate' : 'active',
    }).where(eq(listings.id, existing[0].id));

    return new Response(JSON.stringify({
      ok: true,
      action: duplicateOf ? 'updated_duplicate' : 'updated',
      slug: existing[0].slug,
      ...(duplicateOf ? { duplicate_of: duplicateOf.slug } : {}),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Don't create a second row for a car another portal already carries.
  const dup = await findCrossSourceDuplicate({
    source: String(source), year: Number(year), model: String(model),
    price: Number(price ?? 0), mileage: Number(mileage ?? 0),
    new_or_used: String(new_or_used ?? 'Used'), title: String(title),
  });

  if (dup) {
    return new Response(JSON.stringify({ ok: true, action: 'skipped_duplicate', slug: dup.slug }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const slug = `${base}-${String(source_id).slice(-8)}`;

  await db.insert(listings).values({
    slug,
    listing_type: 'for_sale',
    title: String(title),
    model: String(model),
    year: Number(year),
    price: Number(price ?? 0),
    mileage: Number(mileage ?? 0),
    province: String(province ?? ''),
    new_or_used: (new_or_used as 'New' | 'Used') ?? 'Used',
    transmission: (transmission as 'manual' | 'automatic') ?? 'manual',
    colour: String(colour ?? ''),
    description: String(description ?? ''),
    photos: photoJson,
    seller_name: String(seller_name ?? 'Dealer'),
    seller_email: 'info@landcruisersa.co.za',
    seller_phone: '000 000 0000',
    status: 'active',
    source: String(source),
    source_id: String(source_id),
    source_url: String(source_url),
    fuel_type: fuel_type ? String(fuel_type) : null,
    fuel_consumption: fuel_consumption ? Number(fuel_consumption) : null,
    power_kw: power_kw ? Number(power_kw) : null,
    seats: seats ? Number(seats) : null,
    co2: co2 ? Number(co2) : null,
    segment: segmentOverride ?? segmentForModel(String(model)),
    body_type: detectBodyType(String(title), String(description ?? ''), segmentOverride !== 'other-4x4'),
    created_at: new Date(),
  });

  return new Response(JSON.stringify({ ok: true, action: 'created', slug }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
