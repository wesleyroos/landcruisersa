import { db } from '@/db/index';
import { users, favorites, savedSearches, listings, type User } from '@/db/schema';
import { and, eq, isNotNull, gt, gte, lte, like, or, inArray, desc, sql } from 'drizzle-orm';
import { signScoped } from './token';
import { buildAlertEmail, type FavEvent, type SearchMatchGroup } from './alert-email';
import { firstPhotoOrNull } from './photos';

// Daily sweep that emails users about (a) changes to vehicles they SAVED and
// (b) new listings matching a saved SEARCH. Two dedup layers:
//  1. Per-item (favourite.last_notified_*, saved_search.last_notified_at) — the
//     exact guard: a given drop/sale/new-listing is emailed once.
//  2. Per-day (site_config) — a soft guard so repeated scheduler ticks don't
//     re-run the whole sweep within the same day.
// Eligible recipients = verified + consented (POPIA) + not disabled.

const SITE = 'https://landcruisersa.co.za';
const LAST_RUN_KEY = 'alerts_last_run';
const MATCH_LIMIT = 6; // new-match cars listed per saved search in the email

function sastDateString(): string {
  return new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);
}
const nowSec = () => Math.floor(Date.now() / 1000);

function claimToday(today: string): boolean {
  const r = db.run(sql`
    INSERT INTO site_config (key, value, updated_at)
    VALUES (${LAST_RUN_KEY}, ${today}, ${nowSec()})
    ON CONFLICT(key) DO UPDATE SET value = ${today}, updated_at = ${nowSec()}
      WHERE site_config.value <> ${today}
  `);
  return Number(r.changes) > 0;
}

function firstPhoto(photos: string): string | null {
  const src = firstPhotoOrNull(photos);
  if (!src) return null;
  return src.startsWith('http') ? src : `${SITE}${src}`;
}

// ── Favourite change detection ───────────────────────────────────────────────
interface DetectedFav {
  favId: number;
  event: FavEvent;
  update: Partial<typeof favorites.$inferInsert>;
}

function detectFavoriteEvents(user: User, now: Date): DetectedFav[] {
  const rows = db.select({
    favId:    favorites.id,
    baseline: favorites.baseline_price,
    lastPrice: favorites.last_notified_price,
    lastAt:   favorites.last_notified_at,
    slug:     listings.slug,
    title:    listings.title,
    price:    listings.price,
    photos:   listings.photos,
    off:      listings.off_market_at,
  }).from(favorites)
    .innerJoin(listings, eq(favorites.listing_slug, listings.slug))
    .where(eq(favorites.user_id, user.id))
    .all();

  const out: DetectedFav[] = [];
  for (const r of rows) {
    const ref = r.lastPrice ?? r.baseline ?? r.price;
    if (r.off && (!r.lastAt || r.off.getTime() > r.lastAt.getTime())) {
      out.push({
        favId: r.favId,
        event: { type: 'sold', slug: r.slug, title: r.title, photo: firstPhoto(r.photos) },
        update: { last_notified_at: now },
      });
    } else if (!r.off && r.price > 0 && ref && r.price < ref) {
      out.push({
        favId: r.favId,
        event: { type: 'drop', slug: r.slug, title: r.title, photo: firstPhoto(r.photos), fromPrice: ref, toPrice: r.price },
        update: { last_notified_price: r.price, last_notified_at: now },
      });
    }
  }
  return out;
}

// ── Saved-search match detection ─────────────────────────────────────────────
interface DetectedSearch {
  searchId: number;
  group: SearchMatchGroup;
}

// A stored model token may be exact ('200-series') or a family ('prado', 'fj')
// that maps to several DB slugs ('prado-150', …) — match both.
function modelCondition(csv: string) {
  const tokens = csv.split(',').map(t => t.trim()).filter(Boolean);
  if (!tokens.length) return undefined;
  return or(...tokens.map(t => or(eq(listings.model, t), like(listings.model, `${t}-%`))));
}

function detectSearchMatches(user: User): DetectedSearch[] {
  const searches = db.select().from(savedSearches)
    .where(and(eq(savedSearches.user_id, user.id), eq(savedSearches.active, true)))
    .all();

  const out: DetectedSearch[] = [];
  for (const s of searches) {
    // Only listings added since we last alerted them (or since the search was
    // created) — so the first email isn't a dump of all existing stock.
    const since = s.last_notified_at ?? s.created_at;
    const conds = [
      eq(listings.status, 'active'),
      eq(listings.segment, s.segment),
      gt(listings.created_at, since),
    ];
    if (s.model) { const m = modelCondition(s.model); if (m) conds.push(m); }
    if (s.province) conds.push(inArray(listings.province, s.province.split(',').map(p => p.trim()).filter(Boolean)));
    if (s.price_min) conds.push(gte(listings.price, s.price_min));
    if (s.price_max) conds.push(lte(listings.price, s.price_max));
    if (s.year_min) conds.push(gte(listings.year, s.year_min));
    if (s.year_max) conds.push(lte(listings.year, s.year_max));

    const where = and(...conds);
    const total = db.select({ n: sql<number>`cast(count(*) as int)` }).from(listings).where(where).get()?.n ?? 0;
    if (!total) continue;

    const rows = db.select({ slug: listings.slug, title: listings.title, price: listings.price, photos: listings.photos })
      .from(listings).where(where).orderBy(desc(listings.created_at)).limit(MATCH_LIMIT).all();
    const cars = rows.map(r => ({ slug: r.slug, title: r.title, price: r.price, photo: firstPhoto(r.photos) }));

    out.push({ searchId: s.id, group: { label: s.label ?? 'Saved search', cars, more: Math.max(0, total - cars.length) } });
  }
  return out;
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const RESEND_KEY = import.meta.env.RESEND_API_KEY ?? process.env.RESEND_API_KEY ?? '';
  if (!RESEND_KEY) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Land Cruiser SA <noreply@landcruisersa.co.za>',
      to, reply_to: 'info@landcruisersa.co.za', subject, html,
    }),
  }).catch(() => null);
  return Boolean(res?.ok);
}

export interface SweepResult {
  skipped?: string;
  usersNotified: number;
  emailsSent: number;
  favEvents: number;
  searchMatches: number;
  dryRun: boolean;
  details: Array<{
    email: string;
    events: Array<{ type: string; title: string; from?: number; to?: number }>;
    searches: Array<{ label: string; matches: number }>;
  }>;
}

export async function runAlertSweep({ force = false, dryRun = false }: { force?: boolean; dryRun?: boolean } = {}): Promise<SweepResult> {
  if (!dryRun && !force) {
    const today = sastDateString();
    if (!claimToday(today)) {
      return { skipped: 'already-run-today', usersNotified: 0, emailsSent: 0, favEvents: 0, searchMatches: 0, dryRun, details: [] };
    }
  }

  const now = new Date();
  const eligible = db.select().from(users)
    .where(and(isNotNull(users.verified_at), isNotNull(users.consent_at), eq(users.disabled, false)))
    .all();

  let usersNotified = 0, emailsSent = 0, favEvents = 0, searchMatches = 0;
  const details: SweepResult['details'] = [];

  for (const u of eligible) {
    const favEvts = detectFavoriteEvents(u, now);
    const searchGroups = detectSearchMatches(u);
    if (!favEvts.length && !searchGroups.length) continue;

    usersNotified++;
    favEvents += favEvts.length;
    searchMatches += searchGroups.reduce((n, g) => n + g.group.cars.length + g.group.more, 0);
    details.push({
      email: u.email,
      events: favEvts.map(e => ({ type: e.event.type, title: e.event.title, from: e.event.fromPrice, to: e.event.toPrice })),
      searches: searchGroups.map(g => ({ label: g.group.label, matches: g.group.cars.length + g.group.more })),
    });
    if (dryRun) continue;

    const firstName = (u.name ?? '').trim().split(/\s+/)[0] || 'there';
    const unsubUrl = `${SITE}/unsubscribe/?token=${signScoped('unsub', { uid: u.id })}`;
    const { subject, html } = buildAlertEmail({
      firstName,
      events: favEvts.map(e => e.event),
      searches: searchGroups.map(g => g.group),
      unsubUrl,
    });

    if (await sendEmail(u.email, subject, html)) {
      emailsSent++;
      // Advance dedup cursors only on a successful send (failed email retries next run).
      for (const e of favEvts) db.update(favorites).set(e.update).where(eq(favorites.id, e.favId)).run();
      for (const g of searchGroups) db.update(savedSearches).set({ last_notified_at: now }).where(eq(savedSearches.id, g.searchId)).run();
    }
  }

  return { usersNotified, emailsSent, favEvents, searchMatches, dryRun, details };
}
