export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { sql } from 'drizzle-orm';
import { requireAdmin, unauthorized } from '@/lib/admin-auth';
import { dealerKey, SOURCE_LABEL } from '@/lib/dealer-name';

// Name lookup across EVERY dealership we've ever scraped (~2.8k of them), so
// the radar's search box can reach the long tail it doesn't rank. Read-only.
export const GET: APIRoute = async ({ cookies, url }) => {
  if (!requireAdmin(cookies)) return unauthorized();

  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length < 2) {
    return new Response(JSON.stringify({ dealers: [], total: 0 }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  // instr(), not LIKE — no wildcard escaping to get wrong on a name like "A_B".
  const needle = q.toLowerCase();
  const rows = db.all<{ seller: string; source: string; stock: number; total: number }>(sql`
    SELECT seller_name seller, source,
           sum(CASE WHEN status = 'active' THEN 1 ELSE 0 END) stock,
           count(*) total
    FROM listings
    WHERE source != 'own' AND seller_name != ''
      AND instr(lower(seller_name), ${needle}) > 0
    GROUP BY seller_name, source
  `);

  // Fold the name variants each portal uses for the same branch. Stock is the
  // MAX across portals, never the sum: the same cars are listed on both.
  type Hit = { key: string; name: string; sources: string[]; stock: number; total: number; best: number };
  const byKey = new Map<string, Hit>();
  for (const r of rows) {
    const key = dealerKey(r.seller);
    let h = byKey.get(key);
    if (!h) { h = { key, name: r.seller, sources: [], stock: 0, total: 0, best: 0 }; byKey.set(key, h); }
    const label = SOURCE_LABEL[r.source] ?? r.source;
    if (!h.sources.includes(label)) h.sources.push(label);
    h.total += r.total;
    if (r.stock > h.stock) h.stock = r.stock;
    if (r.total > h.best) { h.best = r.total; h.name = r.seller; }  // most-seen spelling wins
  }

  const all = [...byKey.values()].sort((a, b) => b.stock - a.stock || b.total - a.total);
  const dealers = all.slice(0, 30).map(({ best, ...d }) => d);

  return new Response(JSON.stringify({ dealers, total: all.length }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};
