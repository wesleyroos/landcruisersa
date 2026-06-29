import { db } from '@/db/index';
import { users, favorites, listings, type User } from '@/db/schema';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { signScoped } from './token';
import { buildFavoriteAlertEmail, type FavEvent } from './alert-email';

// Daily sweep that emails users about changes to their saved vehicles. Two
// independent dedup layers:
//  1. Per-favourite (last_notified_price / last_notified_at) — the exact guard:
//     a given price drop or sale is emailed once, ever.
//  2. Per-day (site_config) — a soft guard so the scheduler's repeated ticks
//     don't re-run the whole sweep within the same day.
// Eligible recipients = verified + consented (POPIA) + not disabled.

const SITE = 'https://landcruisersa.co.za';
const LAST_RUN_KEY = 'alerts_last_run';

function sastDateString(): string {
  return new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);
}
const nowSec = () => Math.floor(Date.now() / 1000);

// Atomically claim today; returns true only for the caller that flips the date.
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
  try {
    const arr = JSON.parse(photos) as string[];
    const src = arr?.[0] ?? null;
    if (!src) return null;
    return src.startsWith('http') ? src : `${SITE}${src}`;
  } catch { return null; }
}

interface DetectedEvent {
  favId: number;
  event: FavEvent;
  update: Partial<typeof favorites.$inferInsert>;
}

// Compute the pending alert events for one user's favourites.
function detectFavoriteEvents(user: User, now: Date): DetectedEvent[] {
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

  const out: DetectedEvent[] = [];
  for (const r of rows) {
    // Reference price for "did it drop" = the last price we alerted on, else the
    // price when they saved it.
    const ref = r.lastPrice ?? r.baseline ?? r.price;

    if (r.off && (!r.lastAt || r.off.getTime() > r.lastAt.getTime())) {
      // Went off-market after our last notification → sold/removed (once).
      out.push({
        favId: r.favId,
        event: { type: 'sold', slug: r.slug, title: r.title, photo: firstPhoto(r.photos) },
        update: { last_notified_at: now },
      });
    } else if (!r.off && r.price > 0 && ref && r.price < ref) {
      // Still live and cheaper than the reference → price drop.
      out.push({
        favId: r.favId,
        event: { type: 'drop', slug: r.slug, title: r.title, photo: firstPhoto(r.photos), fromPrice: ref, toPrice: r.price },
        update: { last_notified_price: r.price, last_notified_at: now },
      });
    }
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
  dryRun: boolean;
  details: Array<{ email: string; events: Array<{ type: string; title: string; from?: number; to?: number }> }>;
}

// Run the sweep. dryRun = detect + return, no send, no DB writes, no day-claim
// (for verification). force = bypass the per-day guard (manual trigger).
export async function runAlertSweep({ force = false, dryRun = false }: { force?: boolean; dryRun?: boolean } = {}): Promise<SweepResult> {
  if (!dryRun && !force) {
    const today = sastDateString();
    if (!claimToday(today)) {
      return { skipped: 'already-run-today', usersNotified: 0, emailsSent: 0, favEvents: 0, dryRun, details: [] };
    }
  }

  const now = new Date();
  const eligible = db.select().from(users)
    .where(and(isNotNull(users.verified_at), isNotNull(users.consent_at), eq(users.disabled, false)))
    .all();

  let usersNotified = 0, emailsSent = 0, favEvents = 0;
  const details: SweepResult['details'] = [];

  for (const u of eligible) {
    const evs = detectFavoriteEvents(u, now);
    if (!evs.length) continue;
    usersNotified++;
    favEvents += evs.length;
    details.push({
      email: u.email,
      events: evs.map(e => ({ type: e.event.type, title: e.event.title, from: e.event.fromPrice, to: e.event.toPrice })),
    });
    if (dryRun) continue;

    const firstName = (u.name ?? '').trim().split(/\s+/)[0] || 'there';
    const unsubUrl = `${SITE}/unsubscribe/?token=${signScoped('unsub', { uid: u.id })}`;
    const { subject, html } = buildFavoriteAlertEmail({ firstName, events: evs.map(e => e.event), unsubUrl });

    if (await sendEmail(u.email, subject, html)) {
      emailsSent++;
      // Only advance the per-favourite dedup state on a successful send, so a
      // failed email is retried next run instead of being silently swallowed.
      for (const e of evs) db.update(favorites).set(e.update).where(eq(favorites.id, e.favId)).run();
    }
  }

  return { usersNotified, emailsSent, favEvents, dryRun, details };
}
