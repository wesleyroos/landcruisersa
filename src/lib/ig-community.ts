import Anthropic from '@anthropic-ai/sdk';
import { db } from '@/db/index';
import { communityBuilds, type CommunityBuild } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { putToR2 } from './sources/r2';

// ─── Community Build Engine ──────────────────────────────────────────────────
// Ported from Jimny SA (the pathfinder — bets #7–#9 all HIT there, 2026-08).
// Turns a found community Cruiser build (image URL + owner handle) into a
// queued repost: rehosts the image to R2 (so it's ours to serve on /builds and
// to publish to IG), auto-drafts a credit caption in the fan-page voice, and
// saves a draft the admin can tweak + schedule. The image download runs
// server-side (IG's CDN isn't IP-blocked from Fly, unlike its API).

// Fan-page opener pool — AI writes one per build; this is the fallback.
const FALLBACK_HOOKS = [
  'Now THAT is a Cruiser. 🔥',
  'Built for Africa. 💪',
  'The legend, done right. 👌',
  'Weekend goals. 🏕️',
  'Unstoppable. 🌍',
  'This is the way. ⛰️',
];

const zapierSafe = (s: string) => s.replace(/[ -]/g, ' ').trim();

function slugify(handle: string): string {
  const base = handle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'build';
  return base;
}

async function uniqueSlug(handle: string): Promise<string> {
  const base = slugify(handle);
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const hit = db.select({ id: communityBuilds.id }).from(communityBuilds).where(eq(communityBuilds.slug, slug)).get();
    if (!hit) return slug;
  }
  return `${base}-${Date.now().toString(36).slice(-4)}`;
}

interface CaptionParts { hook: string; caption: string }

const SITE = 'https://landcruisersa.co.za';

// Their hashtags (+ caption words) → a human build-spec line. Turns "#arb
// #oldmanemu #bfgoodrich #troopy" into "ARB · Old Man Emu · BFGoodrich".
// One label per category (first hit wins), capped, so a build that spams tyre
// tags can't fill the whole line.
const SPEC_LEXICON: [RegExp, string][] = [
  [/\barb\b/i, 'ARB'],
  [/ironman/i, 'Ironman'],
  [/alu[\s-]?cab/i, 'Alu-Cab'],
  [/front[\s-]?runner/i, 'Front Runner'],
  [/bush[\s-]?tech|rsi[\s-]?smart/i, 'canopy'],
  [/old[\s-]?man[\s-]?emu|\bome\b|bp[\s-]?51|dobinson|tough[\s-]?dog|king[\s-]?shocks|fox[\s-]?shocks/i, 'upgraded suspension'],
  [/lift|lifted/i, 'lift kit'],
  [/snorkel|safari[\s-]?snorkel/i, 'snorkel'],
  [/\bwinch\b|\bwarn\b|runva|sherpa/i, 'winch'],
  [/rock[\s-]?slider/i, 'rock sliders'],
  [/bull[\s-]?bar|bullbar/i, 'bull bar'],
  [/long[\s-]?range|\blrт?\s?tank/i, 'long-range tank'],
  [/drawer|storage[\s-]?system/i, 'drawer system'],
  [/dual[\s-]?battery|national[\s-]?luna/i, 'dual battery'],
  [/ikamper|roof[\s-]?top[\s-]?tent|\brtt\b|howling[\s-]?moon|eezi[\s-]?awn/i, 'rooftop tent'],
  [/diff[\s-]?lock|air[\s-]?locker/i, 'diff locks'],
  [/bf[\s-]?goodrich|\bbfg\b/i, 'BFGoodrich'],
  [/general[\s-]?(tire|tyre|grabber)/i, 'General A/Ts'],
  [/maxxis/i, 'Maxxis'],
  [/cooper[\s-]?(tire|tyre|st)/i, 'Cooper tyres'],
  [/mud[\s-]?terrain|all[\s-]?terrain|\b3[35]s\b|\b37s\b|beadlock|wheel[\s-]?spacer/i, 'off-road rubber'],
];

// Guess which Cruiser market a build belongs to, from the owner's hashtags/
// caption/handle, so /builds can show the matching market strip. Unlike the
// Jimny (where one generation dominates), Cruiser builds spread across the
// whole family — unrecognised builds default to null (all Cruisers) rather
// than guessing wrong. Admin can override on the queue card.
const MODEL_GUESSES: [RegExp, string][] = [
  [/\b(lc)?79\b|79[\s-]?series|single[\s-]?cab.*cruiser|double[\s-]?cab.*cruiser/i, '79-series'],
  [/\b(lc)?76\b|76[\s-]?series/i, '76-series'],
  [/\b(lc)?78\b|78[\s-]?series|troopy|troop[\s-]?carrier|troopcarrier/i, '78-series'],
  [/\b(lc)?300\b|300[\s-]?series/i, '300-series'],
  [/\b(lc)?200\b|200[\s-]?series/i, '200-series'],
  [/\b(lc)?10[05]\b|10[05][\s-]?series/i, '100-series'],
  [/\b(lc)?80\b|80[\s-]?series/i, '80-series'],
  [/\b(lc)?70\b|70[\s-]?series/i, '70-series'],
  [/prado[\s-]?250|\b250[\s-]?series\b/i, 'prado-250'],
  [/prado[\s-]?150/i, 'prado-150'],
  [/prado[\s-]?120/i, 'prado-120'],
  [/prado/i, 'prado-150'],
  [/fj[\s-]?cruiser|\bfj\b/i, 'fj-cruiser'],
  [/\b[fbh]j4[0-7]\b|40[\s-]?series/i, '40-series'],
  [/\b[fbh]j6[0-2]\b|60[\s-]?series/i, '60-series'],
];

export function guessMarketModel(hashtags: string[] = [], caption?: string | null, handle?: string | null): string | null {
  const hay = [...hashtags.map(h => h.replace(/^#/, '')), caption ?? '', handle ?? ''].join(' ').toLowerCase();
  for (const [re, model] of MODEL_GUESSES) if (re.test(hay)) return model;
  return null;
}

export function communityBuildSpec(hashtags: string[] = [], caption?: string | null): string {
  const hay = [...hashtags.map(h => h.replace(/^#/, '')), caption ?? ''].join(' ');
  const hits: string[] = [];
  for (const [re, label] of SPEC_LEXICON) {
    if (re.test(hay) && !hits.includes(label)) hits.push(label);
    if (hits.length >= 6) break;
  }
  return hits.join(' · ');
}

interface CaptionCtx { sourceCaption?: string | null; location?: string | null; buildSpec?: string | null; slug?: string; }

// Repost caption: punchy hook + place + generous "📷 Photo by @handle" credit +
// build spec + an fb-caption /builds link (not clickable on IG, but clickable
// when cross-posted to Facebook — attributes that traffic separately) + 5
// hashtags (IG's Dec-2025 cap).
export async function generateCommunityCaption(handle: string, ctx: CaptionCtx = {}): Promise<CaptionParts> {
  const { sourceCaption, location, buildSpec, slug } = ctx;
  const fallbackHook = FALLBACK_HOOKS[Math.floor((handle.length + (sourceCaption?.length ?? 0)) % FALLBACK_HOOKS.length)];
  const fallbackTags = '#LandCruiser #LandCruiserSA #Cruiser #4x4 #Overland';
  const apiKey = process.env.ANTHROPIC_API_KEY ?? import.meta.env.ANTHROPIC_API_KEY;

  let hook = fallbackHook;
  let tags = fallbackTags;
  if (apiKey) {
    try {
      const client = new Anthropic({ apiKey });
      const msg = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 160,
        messages: [{
          role: 'user',
          content: `You run @landcruisersa, a South African Toyota Land Cruiser fan page that reposts great community builds with credit. Write the repost for a build by @${handle}.
${sourceCaption ? `Their caption (context, don't copy): "${sourceCaption.slice(0, 300)}"` : ''}
${location ? `Location: ${location}` : ''}
${buildSpec ? `The build runs: ${buildSpec}` : ''}

Return ONLY this JSON, nothing else:
{"hook": "<one punchy admiring opening line, 3-8 words, one fitting emoji, no hashtags; you may nod to the location or a standout mod>", "hashtags": "<exactly 5 space-separated hashtags, must include #LandCruiser and #LandCruiserSA>"}`,
        }],
      });
      const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
      const m = text.match(/\{[\s\S]*\}/);
      if (m) {
        const p = JSON.parse(m[0]);
        if (typeof p.hook === 'string' && p.hook.trim()) hook = zapierSafe(p.hook).slice(0, 80);
        const t = String(p.hashtags ?? '').match(/#[A-Za-z0-9_]+/g);
        if (t?.length) tags = t.slice(0, 5).join(' ');
      }
    } catch { /* fall through to fallbacks */ }
  }

  const buildsLink = slug ? `${SITE}/builds/${slug}/?utm_source=fb-caption` : `${SITE}/builds/?utm_source=fb-caption`;
  const lines = [hook];
  if (location) lines.push(`📍 ${location}`);
  lines.push('', `📷 Photo by @${handle} — go give them a follow!`);
  if (buildSpec) lines.push(`🔧 ${buildSpec}`);
  lines.push('', `See more Cruiser builds 👉 ${buildsLink}`, '', tags);

  return { hook, caption: lines.join('\n') };
}

export interface CaptureInput {
  imageUrl?: string;       // IG CDN url (single) — or use imageUrls for a carousel
  imageUrls?: string[];    // multiple (carousel) — first becomes the cover
  handle: string;          // owner handle, no @
  sourceUrl?: string;      // original post permalink
  sourceCaption?: string;
  location?: string;
  hashtags?: string[];
  likes?: number;
  width?: number;
  height?: number;
}

async function fetchImage(url: string): Promise<{ body: Buffer; contentType: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh) Chrome/126', 'Accept': 'image/*,*/*' },
      signal: AbortSignal.timeout(25_000),
    });
    const ct = res.headers.get('content-type') ?? '';
    if (!res.ok || !ct.startsWith('image/')) return null;
    const body = Buffer.from(await res.arrayBuffer());
    return body.length >= 5_000 ? { body, contentType: ct } : null;
  } catch { return null; }
}

type CaptureResult = { ok: true; build: CommunityBuild } | { ok: false; error: string };

interface DraftOpts { sourceUrl?: string; sourceCaption?: string; location?: string; hashtags?: string[]; likes?: number; width?: number; height?: number; }

const extFor = (ct: string) => ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';

// Shared core: given 1+ images (bytes), host all to R2 + derive the build spec +
// draft the (enriched, fb-linked) caption + insert. First image is the cover.
async function draftFromImages(imgs: { body: Buffer; contentType: string }[], handle: string, opts: DraftOpts): Promise<CaptureResult> {
  if (!imgs.length) return { ok: false, error: 'no usable image' };
  const slug = await uniqueSlug(handle);
  const hosted: string[] = [];
  for (let i = 0; i < imgs.length; i++) {
    const key = `images/builds/${slug}${i === 0 ? '' : '-' + (i + 1)}.${extFor(imgs[i].contentType)}`;
    const url = await putToR2(key, imgs[i].body, imgs[i].contentType);
    if (url) hosted.push(url);
  }
  if (!hosted.length) return { ok: false, error: 'R2 upload failed (check R2 secrets)' };

  const location = opts.location?.trim().slice(0, 120) || null;
  const buildSpec = communityBuildSpec(opts.hashtags, opts.sourceCaption) || null;
  const { hook, caption } = await generateCommunityCaption(handle, {
    sourceCaption: opts.sourceCaption, location, buildSpec, slug,
  });

  const res = db.insert(communityBuilds).values({
    slug, credit_handle: handle,
    source_url: opts.sourceUrl ?? null,
    source_caption: opts.sourceCaption?.slice(0, 2000) ?? null,
    image_url: hosted[0],
    images: hosted.length > 1 ? JSON.stringify(hosted) : null,
    width: opts.width ?? null, height: opts.height ?? null,
    caption, hook, location, build_spec: buildSpec,
    market_model: guessMarketModel(opts.hashtags, opts.sourceCaption, handle),
    source_hashtags: opts.hashtags?.length ? opts.hashtags.join(',').slice(0, 1000) : null,
    source_likes: Number.isFinite(opts.likes) ? Number(opts.likes) : null,
    status: 'draft', created_at: new Date(),
  }).run();
  const build = db.select().from(communityBuilds).where(eq(communityBuilds.id, Number(res.lastInsertRowid))).get()!;
  return { ok: true, build };
}

// Path 1 — from URLs (extension hands us the scontent image URL(s); Fly can
// fetch the CDN even though IG's API is blocked). A carousel = many URLs.
export async function captureBuild(input: CaptureInput): Promise<CaptureResult> {
  const handle = input.handle.replace(/^@/, '').trim().toLowerCase();
  if (!handle) return { ok: false, error: 'handle required' };
  const urls = (input.imageUrls?.length ? input.imageUrls : [input.imageUrl])
    .filter((u): u is string => typeof u === 'string' && /^https:\/\//.test(u))
    .slice(0, 10);
  if (!urls.length) return { ok: false, error: 'valid image url required' };

  const imgs: { body: Buffer; contentType: string }[] = [];
  for (const u of urls) { const img = await fetchImage(u); if (img) imgs.push(img); }
  if (!imgs.length) return { ok: false, error: 'could not fetch any image' };
  return draftFromImages(imgs, handle, input);
}

// Path 2 — from an uploaded file (screenshot / saved image). Bulletproof.
export async function captureBuildFromBytes(body: Buffer, contentType: string, handle: string, sourceUrl?: string): Promise<CaptureResult> {
  const h = handle.replace(/^@/, '').trim().toLowerCase();
  if (!h) return { ok: false, error: 'handle required' };
  if (!contentType.startsWith('image/')) return { ok: false, error: 'not an image file' };
  if (body.length < 5_000) return { ok: false, error: 'image too small / not a real photo' };
  return draftFromImages([{ body, contentType }], h, { sourceUrl });
}
