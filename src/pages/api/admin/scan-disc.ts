export const prerender = false;

import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import { db } from '@/db/index';
import { listings, listingDocs } from '@/db/schema';
import { requireAdmin, unauthorized } from '@/lib/admin-auth';
import { eq } from 'drizzle-orm';

sharp.concurrency(1);

function bad(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

// Everything printed on a South African licence disc that we care about.
// Nullable so the model can skip unreadable fields instead of guessing.
const DISC_SCHEMA = {
  type: 'object',
  properties: {
    vin:          { type: ['string', 'null'], description: 'VIN / chassis number, e.g. JTEBV71J70B057452' },
    engine_no:    { type: ['string', 'null'], description: 'Engine no. / Enjinnr.' },
    licence_no:   { type: ['string', 'null'], description: 'Licence no. / Lisensienr. (the number plate)' },
    register_no:  { type: ['string', 'null'], description: 'Vehicle register no. / Voertuigregisternr., e.g. JWD982L' },
    disc_no:      { type: ['string', 'null'], description: 'Disc serial printed at the top after NO.' },
    disc_expiry:  { type: ['string', 'null'], description: 'Date of expiry / Vervaldatum as YYYY-MM-DD' },
    date_of_test: { type: ['string', 'null'], description: 'Date of test / Datum van toets as YYYY-MM-DD' },
    make:         { type: ['string', 'null'], description: 'Make / Fabrikaat' },
    description:  { type: ['string', 'null'], description: 'Description / Beskrywing, e.g. Station wagon' },
    gvm_kg:       { type: ['string', 'null'], description: 'GVM / BVM in kg, digits only' },
    tare_kg:      { type: ['string', 'null'], description: 'Tare / Tarra in kg, digits only' },
    persons_seated: { type: ['string', 'null'], description: 'Persons seated / Sittende, digits only' },
  },
  required: [
    'vin', 'engine_no', 'licence_no', 'register_no', 'disc_no', 'disc_expiry',
    'date_of_test', 'make', 'description', 'gvm_kg', 'tare_kg', 'persons_seated',
  ],
  additionalProperties: false,
} as const;

const PROMPT = `This is a photo of a South African vehicle licence disc (lisensieskyf), usually round and stuck to the windscreen, often photographed at an angle through glass with reflections.

Read the printed fields exactly as they appear — transcribe character by character, do not "correct" a value to something more common. VINs and register numbers mix letters and digits; watch for 0/O, 1/I, 5/S, 8/B confusions and use the surrounding print quality to decide. Dates on the disc are printed YYYY-MM-DD.

If a field is genuinely unreadable or not present, return null for it rather than guessing.`;

// AI-extract vehicle identity fields from a licence disc photo. Admin-only.
// Accepts multipart form data: listing_id + optional disc_image file. When no
// file is sent it falls back to the disc image already stored for the listing.
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!requireAdmin(cookies)) return unauthorized();

  const apiKey = process.env.ANTHROPIC_API_KEY ?? import.meta.env.ANTHROPIC_API_KEY;
  if (!apiKey) return bad('ANTHROPIC_API_KEY is not configured', 500);

  let form: FormData;
  try { form = await request.formData(); } catch { return bad('Expected form data'); }

  const listingId = Number(form.get('listing_id'));
  if (!Number.isInteger(listingId)) return bad('Invalid listing_id');

  const [listing] = await db.select({ id: listings.id, source: listings.source })
    .from(listings).where(eq(listings.id, listingId));
  if (!listing) return bad('Listing not found', 404);
  if (listing.source !== 'own') return bad('Disc scanning is only for own/private-seller listings', 403);

  // Prefer a freshly selected file (scan before saving); else the stored blob.
  let imageBuf: Buffer | null = null;
  const file = form.get('disc_image');
  if (file && typeof file !== 'string' && file.size > 0) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return bad('Invalid image type');
    if (file.size > 15 * 1024 * 1024) return bad('Image too large (max 15MB)');
    try {
      imageBuf = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000, failOn: 'none' })
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer();
    } catch {
      return bad('Could not read that image file');
    }
  } else {
    const [doc] = await db.select({ disc_image: listingDocs.disc_image })
      .from(listingDocs).where(eq(listingDocs.listing_id, listingId));
    if (doc?.disc_image) imageBuf = Buffer.from(doc.disc_image as Buffer);
  }
  if (!imageBuf) return bad('No disc photo — choose a photo or upload one first', 404);

  const client = new Anthropic({ apiKey });
  let response: any;
  try {
    // Server-side refusal fallback on by default for claude-opus-5 (recommended);
    // structured output guarantees the JSON matches DISC_SCHEMA.
    response = await (client.beta.messages as any).create({
      model: 'claude-opus-5',
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: DISC_SCHEMA },
      },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBuf.toString('base64') } },
          { type: 'text', text: PROMPT },
        ],
      }],
    });
  } catch (err: any) {
    console.error('[scan-disc] API error:', err?.message ?? err);
    return bad('AI scan failed — try again in a minute', 502);
  }

  if (response.stop_reason === 'refusal') return bad('AI declined to read this image', 502);

  const text = (response.content ?? []).find((b: any) => b.type === 'text')?.text ?? '';
  let fields: Record<string, string | null>;
  try { fields = JSON.parse(text); } catch { return bad('AI returned an unreadable result — try again', 502); }

  return new Response(JSON.stringify({ ok: true, fields }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};
