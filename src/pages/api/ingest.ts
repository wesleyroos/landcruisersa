export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { listings, priceEvents } from '@/db/schema';
import { and, eq, ne } from 'drizzle-orm';
import { segmentForModel, detectBodyType } from '@/lib/sources/normalize';

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
  } = body as Record<string, unknown>;

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
      segment: segmentForModel(effectiveModel),
      // Classify only unclassified rows — an admin's manual body_type verdict
      // ('standard' opt-out or confirmed 'game-viewer') survives re-ingest.
      body_type: existing[0].body_type
        ?? detectBodyType(String(title), String(description ?? '').trim() || existing[0].description),
      status: 'active',
    }).where(eq(listings.id, existing[0].id));

    return new Response(JSON.stringify({ ok: true, action: 'updated', slug: existing[0].slug }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Cross-source dedupe: the same physical car often appears on multiple
  // portals (e.g. a WeBuyCars unit on both webuycars.co.za and cars.co.za).
  // Skip creating when another source already carries an active listing with
  // identical year, model, price and mileage. Zero price/mileage is excluded —
  // too many legitimate listings share those.
  if (Number(price) > 0 && Number(mileage) > 0) {
    const dup = await db.select({ id: listings.id, slug: listings.slug })
      .from(listings)
      .where(and(
        eq(listings.status, 'active'),
        eq(listings.year, Number(year)),
        eq(listings.model, String(model)),
        eq(listings.price, Number(price)),
        eq(listings.mileage, Number(mileage)),
        ne(listings.source, String(source)),
      ))
      .limit(1);

    if (dup.length > 0) {
      return new Response(JSON.stringify({ ok: true, action: 'skipped_duplicate', slug: dup[0].slug }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
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
    segment: segmentForModel(String(model)),
    body_type: detectBodyType(String(title), String(description ?? '')),
    created_at: new Date(),
  });

  return new Response(JSON.stringify({ ok: true, action: 'created', slug }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
