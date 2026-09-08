import { db } from '@/db/index';
import {
  users, favorites, savedSearches, contacts, listings,
  enquiries, trainingLeads, wantedRequests, financeLeads,
  valuationRequests, valuationCertificates,
} from '@/db/schema';
import { desc, sql } from 'drizzle-orm';

// The master person list.
//
// Lifted out of /admin/users so the Engage sync and the admin page cannot
// disagree about who a person is. They were about to: the page merges nine
// tables and dedupes on email with a phone fallback, and a sync that
// reimplemented that would have pushed a different set of people to Engage
// than the page reports — with duplicates resolved by luck.
//
// One row per PERSON, merged across accounts, private sellers, the old
// WordPress import, enquiries (contact form + chat + advertise), training,
// game-viewer wanted, finance leads, valuations and certificate leads.
// Identity is the lowercased email; phone-only people get a phone identity so
// they are not dropped. Internal and test addresses are excluded.

export interface Person {
  name: string;
  email: string;
  phone: string;
  sources: Record<string, number>;   // label → row count
  consentAt: number | null;          // earliest consent, ms
  consentSource: string | null;
  first: number;                     // ms
  last: number;                      // ms
  notes: string[];                   // activity fragments ("3 listings · 1 sold")
}

export interface MasterList {
  master: Person[];
  sourceTotals: Map<string, number>;
  masterTotal: number;
  consentedTotal: number;
  recordTotal: number;
}

export function buildMasterList(): MasterList {
  // ── The master list ──────────────────────────────────────────────────────────
  // One row per PERSON, merged across every table that captures somebody:
  // accounts, private sellers, the old WordPress import, enquiries (contact form
  // + chat + advertise), training, game-viewer wanted, finance leads, valuations
  // and certificate leads. Identity = email (lowercased); phone-only people get
  // a phone identity so they aren't dropped. Internal/test addresses excluded.

  interface Person {
    name: string;
    email: string;
    phone: string;
    sources: Record<string, number>;   // label → row count
    consentAt: number | null;          // earliest consent, ms
    consentSource: string | null;
    first: number;                     // ms
    last: number;                      // ms
    notes: string[];                   // activity fragments ("3 listings · 1 sold")
  }

  const people = new Map<string, Person>();
  const isInternal = (e: string) => /grodigital|landcruisersa/i.test(e);
  const keyFor = (email: string, phone: string): string | null => {
    const e = email.trim().toLowerCase();
    if (e) return isInternal(e) ? null : e;
    const p = phone.replace(/\D/g, '');
    return p.length >= 9 ? `p:${p.slice(-9)}` : null;
  };

  function absorb(
    source: string,
    row: {
      name?: string | null; email?: string | null; phone?: string | null;
      at: Date | number | null; consentAt?: Date | number | null; consentSource?: string | null;
    },
  ) {
    const email = String(row.email ?? '').trim();
    const phone = String(row.phone ?? '').trim();
    const key = keyFor(email, phone);
    if (!key) return;
    const at = row.at ? new Date(row.at as Date).getTime() : 0;
    const cAt = row.consentAt ? new Date(row.consentAt as Date).getTime() : null;

    let p = people.get(key);
    if (!p) {
      p = { name: '', email: email.toLowerCase(), phone: '', sources: {}, consentAt: null, consentSource: null, first: at || Date.now(), last: at || 0, notes: [] };
      people.set(key, p);
    }
    const name = String(row.name ?? '').trim();
    if (name.length > p.name.length) p.name = name;
    if (!p.email && email) p.email = email.toLowerCase();
    if (!p.phone && phone) p.phone = phone;
    p.sources[source] = (p.sources[source] ?? 0) + 1;
    if (at) { p.first = Math.min(p.first, at); p.last = Math.max(p.last, at); }
    if (cAt && (!p.consentAt || cAt < p.consentAt)) {
      p.consentAt = cAt;
      p.consentSource = row.consentSource ?? null;
    }
  }

  // 1. Accounts (signups for favourites/alerts)
  const allUsers = db.select().from(users).orderBy(desc(users.created_at)).all();
  const favCounts = new Map<number, number>();
  for (const r of db.select({ uid: favorites.user_id, n: sql<number>`cast(count(*) as int)` }).from(favorites).groupBy(favorites.user_id).all()) favCounts.set(r.uid, r.n);
  const searchCounts = new Map<number, number>();
  for (const r of db.select({ uid: savedSearches.user_id, n: sql<number>`cast(count(*) as int)` }).from(savedSearches).groupBy(savedSearches.user_id).all()) searchCounts.set(r.uid, r.n);
  for (const u of allUsers) {
    absorb('Account', { name: u.name, email: u.email, at: u.created_at, consentAt: u.consent_at, consentSource: u.consent_source });
    const key = keyFor(u.email, '');
    const p = key ? people.get(key) : null;
    if (p) {
      if (u.last_login_at) p.last = Math.max(p.last, new Date(u.last_login_at).getTime());
      const fav = favCounts.get(u.id) ?? 0; const ss = searchCounts.get(u.id) ?? 0;
      if (fav) p.notes.push(`${fav} fav${fav === 1 ? '' : 's'}`);
      if (ss) p.notes.push(`${ss} alert${ss === 1 ? '' : 's'}`);
      if (u.verified_at) p.notes.push('verified');
    }
  }

  // 2. Private sellers — live off the listings table (own listings only)
  const sellerRows = db.select({
    email: listings.seller_email,
    name: sql<string>`max(seller_name)`,
    phone: sql<string>`max(seller_phone)`,
    total: sql<number>`cast(count(*) as int)`,
    active: sql<number>`cast(sum(status = 'active') as int)`,
    sold: sql<number>`cast(sum(status = 'sold') as int)`,
    first: sql<number>`min(created_at)`,
    latest: sql<number>`max(created_at)`,
    consentAt: sql<number | null>`min(seller_consent_at)`,
    consentSource: sql<string | null>`max(seller_consent_source)`,
  }).from(listings)
    .where(sql`source = 'own' AND trim(seller_email) != ''`)
    .groupBy(sql`lower(trim(seller_email))`)
    .all();
  for (const s of sellerRows) {
    absorb('Seller', {
      name: s.name, email: s.email, phone: s.phone,
      at: s.first * 1000,
      consentAt: s.consentAt ? s.consentAt * 1000 : null, consentSource: s.consentSource,
    });
    const key = keyFor(s.email, s.phone);
    const p = key ? people.get(key) : null;
    if (p) {
      p.last = Math.max(p.last, s.latest * 1000);
      p.sources['Seller'] = s.total;
      p.notes.push(`${s.total} listing${s.total === 1 ? '' : 's'}${s.active ? ` (${s.active} live)` : ''}${s.sold ? ` · ${s.sold} sold` : ''}`);
    }
  }

  // 3. Old WordPress/WooCommerce import (extracted 15 Jul 2026)
  const WP_LABEL: Record<string, string> = { shop_customer: 'WP shop', contact_form: 'WP contact', wp_user: 'WP account' };
  for (const c of db.select().from(contacts).all()) {
    absorb(WP_LABEL[c.source] ?? 'WP legacy', { name: c.name, email: c.email, at: c.created_at, consentAt: c.consent_at, consentSource: c.consent_source });
  }

  // 4. Enquiries — contact form, chat widget, advertise-with-us
  for (const e of db.select().from(enquiries).all()) {
    absorb('Enquiry', { name: e.name, email: e.email, phone: e.phone, at: e.created_at, consentAt: e.consent_at, consentSource: e.consent_source });
  }

  // 5. 4x4 training enquiries
  for (const t of db.select().from(trainingLeads).all()) {
    absorb('Training', { name: t.name, email: t.email, phone: t.phone, at: t.created_at, consentAt: t.consent_at, consentSource: t.consent_source });
  }

  // 6. Game-viewer wanted requests
  for (const w of db.select().from(wantedRequests).all()) {
    absorb('Wanted', { name: w.name, email: w.email, phone: w.phone, at: w.created_at, consentAt: w.consent_at, consentSource: 'game-viewer-wanted' });
  }

  // 7. Finance leads (consent is an INTEGER 0/1 on this older table)
  for (const f of db.select().from(financeLeads).all()) {
    absorb('Finance', { name: f.name, email: f.email, phone: f.phone, at: f.created_at, consentAt: f.consent ? f.created_at : null, consentSource: f.consent ? 'finance-lead' : null });
  }

  // 8. Valuations that left contact details (the tool itself works anonymously)
  for (const v of db.select().from(valuationRequests).where(sql`(trim(coalesce(email,'')) != '' OR trim(coalesce(phone,'')) != '')`).all()) {
    absorb('Valuation', {
      name: v.name, email: v.email, phone: v.phone, at: v.created_at,
      consentAt: v.consent_at ?? (v.consent ? v.created_at : null),
      consentSource: v.consent_source ?? (v.consent ? 'valuation-tool' : null),
    });
  }

  // 9. Certificate leads (gated PDF download)
  for (const c of db.select().from(valuationCertificates).where(sql`trim(coalesce(email,'')) != ''`).all()) {
    absorb('Certificate', { name: c.name, email: c.email, phone: c.phone, at: c.issued_at, consentAt: c.consent_at, consentSource: 'valuation-certificate' });
  }

  const master = [...people.values()].sort((a, b) => b.last - a.last);
  const masterTotal = master.length;
  const consentedTotal = master.filter(p => p.consentAt).length;
  const recordTotal = master.reduce((s, p) => s + Object.values(p.sources).reduce((x, n) => x + n, 0), 0);

  // Per-source person counts (a person can appear under several)
  const sourceTotals = new Map<string, number>();
  for (const p of master) for (const s of Object.keys(p.sources)) sourceTotals.set(s, (sourceTotals.get(s) ?? 0) + 1);

  return { master, sourceTotals, masterTotal, consentedTotal, recordTotal };
}

/** Stable identity for Engage, so a re-sync updates rather than duplicates. */
export function personExternalId(p: Person): string {
  return p.email ? `lcsa:email:${p.email}` : `lcsa:phone:${p.phone.replace(/\D/g, '').slice(-9)}`;
}
