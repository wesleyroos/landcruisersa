export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { users, favorites, savedSearches, contacts, listings } from '@/db/schema';
import { requireAdmin, unauthorized } from '@/lib/admin-auth';
import { desc, sql } from 'drizzle-orm';

// CSV export of the three audience lists (users / private sellers / legacy
// contacts) for upload to a Meta Custom Audience. The leading columns use Meta's
// expected header names (email, phone, fn, ln, country) so its uploader
// auto-maps them; the trailing columns carry context + consent so the operator
// can filter (e.g. to alert opt-ins) before uploading. Meta hashes on their side.

const HEADER = [
  // Meta Custom Audience matching keys (their header names)
  'email', 'phone', 'fn', 'ln', 'country',
  // context + consent
  'list', 'name', 'joined', 'verified', 'alert_optin',
  'favourites', 'saved_searches', 'last_seen',
  'listings_total', 'listings_active', 'listings_sold', 'latest_listing',
  'contact_source', 'note',
];

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const isoDate = (d: Date | number | null | undefined): string => {
  if (d == null) return '';
  const date = typeof d === 'number' ? new Date(d * 1000) : new Date(d);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

// Best-effort E.164 for SA numbers so Meta can match on phone.
const normPhone = (raw: string | null | undefined): string => {
  if (!raw) return '';
  const p = String(raw).replace(/[^\d+]/g, '');
  if (!p || p === '+') return '';
  let out: string;
  if (p.startsWith('+')) out = p;
  else if (p.startsWith('00')) out = '+' + p.slice(2);
  else if (p.startsWith('27')) out = '+' + p;
  else if (p.startsWith('0')) out = '+27' + p.slice(1);
  else if (p.length === 9) out = '+27' + p;   // SA mobile missing the leading 0
  else out = p;
  // Drop implausible numbers (junk/demo like "+0") — a full E.164 SA number is
  // +27 + 9 digits. Anything under 10 digits can't match, so export it blank.
  return out.replace(/\D/g, '').length >= 10 ? out : '';
};

const splitName = (name: string | null | undefined): [string, string] => {
  const n = (name ?? '').trim();
  if (!n) return ['', ''];
  const parts = n.split(/\s+/);
  return [parts[0], parts.slice(1).join(' ')];
};

type Row = Record<(typeof HEADER)[number], string | number>;
const blank = (): Row => Object.fromEntries(HEADER.map(h => [h, ''])) as Row;

export const GET: APIRoute = async ({ cookies, url }) => {
  if (!requireAdmin(cookies)) return unauthorized();

  // Which lists to include — default all. ?lists=users,sellers,contacts
  const raw = (url.searchParams.get('lists') ?? 'users,sellers,contacts').toLowerCase();
  const want = new Set(raw.split(',').map(s => s.trim()).filter(Boolean));
  if (want.size === 0) { want.add('users'); want.add('sellers'); want.add('contacts'); }

  const rows: Row[] = [];

  if (want.has('users')) {
    const favCounts = new Map<number, number>();
    for (const r of db.select({ uid: favorites.user_id, n: sql<number>`cast(count(*) as int)` })
      .from(favorites).groupBy(favorites.user_id).all()) favCounts.set(r.uid, r.n);
    const searchCounts = new Map<number, number>();
    for (const r of db.select({ uid: savedSearches.user_id, n: sql<number>`cast(count(*) as int)` })
      .from(savedSearches).groupBy(savedSearches.user_id).all()) searchCounts.set(r.uid, r.n);

    for (const u of db.select().from(users).orderBy(desc(users.created_at)).all()) {
      const [fn, ln] = splitName(u.name);
      const row = blank();
      Object.assign(row, {
        email: u.email ?? '', phone: '', fn, ln, country: 'ZA',
        list: 'User', name: u.name ?? '', joined: isoDate(u.created_at),
        verified: u.verified_at ? 'yes' : 'no',
        alert_optin: u.consent_at ? 'yes' : 'no',
        favourites: favCounts.get(u.id) ?? 0,
        saved_searches: searchCounts.get(u.id) ?? 0,
        last_seen: isoDate(u.last_login_at),
      });
      rows.push(row);
    }
  }

  if (want.has('sellers')) {
    const sellers = db.select({
      email: listings.seller_email,
      name: sql<string>`max(seller_name)`,
      phone: sql<string>`max(seller_phone)`,
      total: sql<number>`cast(count(*) as int)`,
      active: sql<number>`cast(sum(status = 'active') as int)`,
      sold: sql<number>`cast(sum(status = 'sold') as int)`,
      latest: sql<number>`max(created_at)`,
    }).from(listings)
      .where(sql`source = 'own' AND seller_email != '' AND seller_email NOT LIKE '%grodigital%' AND seller_email NOT LIKE '%landcruisersa%'`)
      .groupBy(listings.seller_email)
      .orderBy(sql`max(created_at) desc`)
      .all();
    for (const s of sellers) {
      const [fn, ln] = splitName(s.name);
      const row = blank();
      Object.assign(row, {
        email: s.email ?? '', phone: normPhone(s.phone), fn, ln, country: 'ZA',
        list: 'Private seller', name: s.name ?? '',
        latest_listing: isoDate(s.latest),
        listings_total: s.total, listings_active: s.active, listings_sold: s.sold,
      });
      rows.push(row);
    }
  }

  if (want.has('contacts')) {
    for (const c of db.select().from(contacts).orderBy(contacts.source, contacts.email).all()) {
      const [fn, ln] = splitName(c.name);
      const row = blank();
      Object.assign(row, {
        email: c.email ?? '', phone: '', fn, ln, country: 'ZA',
        list: 'Legacy contact', name: c.name ?? '', joined: isoDate(c.created_at),
        contact_source: c.source ?? '', note: c.note ?? '',
      });
      rows.push(row);
    }
  }

  const lines = [HEADER.join(',')];
  for (const r of rows) lines.push(HEADER.map(h => csvCell(r[h])).join(','));
  // BOM so Excel opens UTF-8 cleanly (accents in names).
  const body = '﻿' + lines.join('\r\n') + '\r\n';

  const today = new Date().toISOString().slice(0, 10);
  const tag = [...want].join('-');
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="lcsa-audience-${tag}-${today}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
};
