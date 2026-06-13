export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { listings, priceEvents } from '@/db/schema';
import { sql, gte } from 'drizzle-orm';

// Aggregate observed asking-price movements — read-only (REPORT_TOKEN ok).
// Feeds the "asking vs selling price" article's data section. Honest framing:
// these are OBSERVED asking-price reductions, NOT confirmed sale prices.
export const GET: APIRoute = async ({ request, url }) => {
  const auth = request.headers.get('authorization') ?? '';
  const ingest = import.meta.env.INGEST_TOKEN ?? process.env.INGEST_TOKEN;
  const report = import.meta.env.REPORT_TOKEN ?? process.env.REPORT_TOKEN;
  if (!((ingest && auth === `Bearer ${ingest}`) || (report && auth === `Bearer ${report}`))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const days = Math.min(Math.max(Number(url.searchParams.get('days') ?? '30'), 1), 365);
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);

  // Net change per slug over the window: earliest old_price vs current price
  const events = db.select({ slug: priceEvents.slug, old_price: priceEvents.old_price })
    .from(priceEvents).where(gte(priceEvents.recorded_at, since))
    .orderBy(priceEvents.recorded_at).all();
  const earliestOld = new Map<string, number>();
  for (const e of events) if (!earliestOld.has(e.slug)) earliestOld.set(e.slug, e.old_price);

  const drops: { model: string; pct: number; rand: number }[] = [];
  if (earliestOld.size > 0) {
    const rows = db.select({ slug: listings.slug, model: listings.model, price: listings.price })
      .from(listings).where(sql`slug IN (${sql.join([...earliestOld.keys()].map(s => sql`${s}`), sql`, `)})`).all();
    for (const r of rows) {
      const old = earliestOld.get(r.slug)!;
      if (r.price > 0 && old > 0 && r.price < old) {
        drops.push({ model: r.model, pct: Math.round((old - r.price) / old * 1000) / 10, rand: old - r.price });
      }
    }
  }

  const totalTracked = (db.select({ n: sql<number>`count(*)` }).from(listings)
    .where(sql`status = 'active' AND price > 0`).get())?.n ?? 0;

  const med = (arr: number[]) => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };

  const byModel: Record<string, { count: number; medianPct: number; medianRand: number }> = {};
  for (const d of drops) {
    (byModel[d.model] ??= { count: 0, medianPct: 0, medianRand: 0 }).count++;
  }
  for (const m of Object.keys(byModel)) {
    const sub = drops.filter(d => d.model === m);
    byModel[m].medianPct = med(sub.map(d => d.pct));
    byModel[m].medianRand = med(sub.map(d => d.rand));
  }

  return new Response(JSON.stringify({
    generated_at: new Date().toISOString(),
    window_days: days,
    note: 'Observed asking-price reductions across all tracked SA platforms. NOT confirmed sale prices.',
    total_active_tracked: totalTracked,
    listings_with_a_drop: drops.length,
    median_drop_pct: med(drops.map(d => d.pct)),
    median_drop_rand: med(drops.map(d => d.rand)),
    by_model: byModel,
  }, null, 1), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
