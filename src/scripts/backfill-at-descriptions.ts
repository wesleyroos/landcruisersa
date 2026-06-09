import { db } from '../db/index.ts';
import { listings } from '../db/schema.ts';
import { eq, and, or, isNull } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

const SITE_URL = process.env.SITE_URL ?? 'https://landcruisersa.fly.dev';
const TOKEN    = process.env.INGEST_TOKEN ?? '';

if (!TOKEN) throw new Error('INGEST_TOKEN not set');

// AT listings with missing description or colour
const targets = db.select({
  id:         listings.id,
  source_url: listings.source_url,
  description: listings.description,
  colour:     listings.colour,
}).from(listings).where(
  and(
    eq(listings.source, 'autotrader'),
    eq(listings.status, 'active'),
    or(
      isNull(listings.description),
      sql`trim(${listings.description}) = ''`,
    )
  )
).all();

console.log(`[at-desc-backfill] ${targets.length} listings need descriptions`);

let updated = 0;
let skipped = 0;
let failed  = 0;

for (const listing of targets) {
  if (!listing.source_url) { skipped++; continue; }

  try {
    const res = await fetch(`${SITE_URL}/api/proxy/images`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: listing.source_url }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) { skipped++; continue; }

    const data = await res.json() as { description?: string; colour?: string; images?: string[] };
    const description = data.description?.trim() ?? '';
    const colour      = data.colour?.trim() ?? '';

    if (!description && !colour) { skipped++; continue; }

    const updates: Record<string, string> = {};
    if (description) updates.description = description;
    if (colour && !listing.colour) updates.colour = colour;

    if (Object.keys(updates).length) {
      db.update(listings).set(updates).where(eq(listings.id, listing.id)).run();
      updated++;
      console.log(`[at-desc-backfill] ${listing.id} updated — desc: ${!!description}, colour: ${!!colour}`);
    } else {
      skipped++;
    }

    await new Promise(r => setTimeout(r, 800));
  } catch (err) {
    console.error(`[at-desc-backfill] ${listing.id} failed:`, err);
    failed++;
  }
}

console.log(`[at-desc-backfill] done — updated: ${updated}, skipped: ${skipped}, failed: ${failed}`);
