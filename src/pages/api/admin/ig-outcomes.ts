export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { listings, viewEvents, clickEvents } from '@/db/schema';
import { sql, isNotNull } from 'drizzle-orm';

// One-call outcome report for tuning the IG post-suggestion weights.
// Per posted listing: traffic and actions SINCE its post date, plus per-model
// rollups. Consumed by the periodic weight-tuning review (Claude session):
//   curl -s $SITE_URL/api/admin/ig-outcomes -H "Authorization: Bearer $INGEST_TOKEN"
export const GET: APIRoute = async ({ request }) => {
  // Accepts the full ingest token or the read-only REPORT_TOKEN (used by the
  // scheduled weight-tuning routine — grants nothing beyond aggregate stats)
  const auth = request.headers.get('authorization') ?? '';
  const ingest = import.meta.env.INGEST_TOKEN ?? process.env.INGEST_TOKEN;
  const report = import.meta.env.REPORT_TOKEN ?? process.env.REPORT_TOKEN;
  const ok = (ingest && auth === `Bearer ${ingest}`) || (report && auth === `Bearer ${report}`);
  if (!ok) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const posted = db.select({
    id: listings.id,
    slug: listings.slug,
    title: listings.title,
    model: listings.model,
    price: listings.price,
    posted_at: listings.ig_posted_at,
  }).from(listings).where(isNotNull(listings.ig_posted_at)).all();

  const perPost = posted.map(p => {
    const since = Math.floor(p.posted_at!.getTime() / 1000);

    const views = (db.get<{ n: number }>(sql`
      SELECT count(*) n FROM view_events
      WHERE listing_slug = ${p.slug} AND created_at >= ${since}
    `))?.n ?? 0;

    const igViews = (db.get<{ n: number }>(sql`
      SELECT count(*) n FROM view_events
      WHERE listing_slug = ${p.slug} AND created_at >= ${since} AND utm_source = 'ig'
    `))?.n ?? 0;

    const clicks = db.all<{ source: string; n: number }>(sql`
      SELECT source, count(*) n FROM click_events
      WHERE listing_slug = ${p.slug} AND created_at >= ${since}
      GROUP BY source
    `);

    const contactClicks = clicks.filter(c => ['whatsapp', 'call', 'email'].includes(c.source))
      .reduce((s, c) => s + c.n, 0);
    const portalClicks = clicks.filter(c => !['whatsapp', 'call', 'email'].includes(c.source))
      .reduce((s, c) => s + c.n, 0);

    return {
      id: p.id, title: p.title, model: p.model, price: p.price,
      posted_at: p.posted_at!.toISOString(),
      days_live: Math.round((Date.now() - p.posted_at!.getTime()) / 86_400_000 * 10) / 10,
      views_since_post: views,
      ig_attributed_views: igViews,
      portal_clicks: portalClicks,
      contact_clicks: contactClicks,
    };
  }).sort((a, b) => b.posted_at.localeCompare(a.posted_at));

  // Per-model rollup — the segment question: what does the audience act on?
  const byModel: Record<string, { posts: number; views: number; igViews: number; clicks: number }> = {};
  for (const p of perPost) {
    const m = byModel[p.model] ?? { posts: 0, views: 0, igViews: 0, clicks: 0 };
    m.posts += 1;
    m.views += p.views_since_post;
    m.igViews += p.ig_attributed_views;
    m.clicks += p.portal_clicks + p.contact_clicks;
    byModel[p.model] = m;
  }

  // Site-wide context (7d) for baseline comparison
  const wk = Math.floor(Date.now() / 1000) - 7 * 86400;
  const siteViews7d = (db.get<{ n: number }>(sql`SELECT count(*) n FROM view_events WHERE created_at >= ${wk}`))?.n ?? 0;
  const igViews7d = (db.get<{ n: number }>(sql`SELECT count(*) n FROM view_events WHERE created_at >= ${wk} AND utm_source = 'ig'`))?.n ?? 0;

  return new Response(JSON.stringify({
    generated_at: new Date().toISOString(),
    posts: perPost,
    by_model: byModel,
    context: { site_views_7d: siteViews7d, ig_views_7d: igViews7d },
  }, null, 1), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
