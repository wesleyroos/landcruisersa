export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { listings, viewEvents, clickEvents } from '@/db/schema';
import { sql, isNotNull } from 'drizzle-orm';

// One-call outcome report for tuning the IG Hero Engine weights.
// Per posted listing: site traffic/actions SINCE its post date PLUS the latest
// IG metrics snapshot (views/reach/likes/saves/… from ig_post_metrics — the
// engine's real target), per-model and per-slot rollups, and the acceptance
// KPI (did the published post match the day's #1 suggestion?). Consumed by the
// periodic weight-tuning review (Claude session):
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
    media_id: listings.ig_media_id,
  }).from(listings).where(isNotNull(listings.ig_posted_at)).all();

  // Slot per listing post (from the ig_posts log; 'legacy' = pre-log backfill)
  const slotByListing = new Map<number, string>(
    db.all<{ listing_id: number; slot: string }>(sql`
      SELECT listing_id, slot FROM ig_posts WHERE listing_id IS NOT NULL
    `).map(r => [r.listing_id, r.slot]),
  );

  // Latest IG metrics snapshot per media id — the engine's real target variable
  const igMetrics = new Map<string, Record<string, number | null>>(
    db.all<{ media_id: string; views: number | null; reach: number | null; likes: number | null; comments: number | null; saves: number | null; shares: number | null; profile_visits: number | null; follows: number | null }>(sql`
      SELECT m.media_id, m.views, m.reach, m.likes, m.comments, m.saves, m.shares, m.profile_visits, m.follows
      FROM ig_post_metrics m
      INNER JOIN (SELECT media_id, MAX(fetched_at) mf FROM ig_post_metrics GROUP BY media_id) latest
        ON latest.media_id = m.media_id AND latest.mf = m.fetched_at
    `).map(r => [r.media_id, { views: r.views, reach: r.reach, likes: r.likes, comments: r.comments, saves: r.saves, shares: r.shares, profile_visits: r.profile_visits, follows: r.follows }]),
  );

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
      slot: slotByListing.get(p.id) ?? 'legacy',
      posted_at: p.posted_at!.toISOString(),
      days_live: Math.round((Date.now() - p.posted_at!.getTime()) / 86_400_000 * 10) / 10,
      views_since_post: views,
      ig_attributed_views: igViews,
      portal_clicks: portalClicks,
      contact_clicks: contactClicks,
      ig: (p.media_id && igMetrics.get(p.media_id)) || null,
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

  // Per-slot rollup on the REAL objective (latest IG snapshot per post)
  const bySlot: Record<string, { posts: number; ig_views: number; reach: number; likes: number; saves: number; follows: number; with_metrics: number }> = {};
  for (const p of perPost) {
    const s = bySlot[p.slot] ?? { posts: 0, ig_views: 0, reach: 0, likes: 0, saves: 0, follows: 0, with_metrics: 0 };
    s.posts += 1;
    if (p.ig) {
      s.with_metrics += 1;
      s.ig_views += p.ig.views ?? 0;
      s.reach += p.ig.reach ?? 0;
      s.likes += p.ig.likes ?? 0;
      s.saves += p.ig.saves ?? 0;
      s.follows += p.ig.follows ?? 0;
    }
    bySlot[p.slot] = s;
  }

  // Acceptance KPI: of the days we suggested a listing, how often did the post
  // published that same SAST day match the suggestion? (v1 baseline ≈ 0%.)
  const suggested = db.all<{ date: string; listing_id: number | null }>(sql`
    SELECT date, listing_id FROM ig_suggestion_log WHERE listing_id IS NOT NULL ORDER BY date DESC LIMIT 30
  `);
  let accepted = 0;
  for (const s of suggested) {
    const hit = db.get<{ n: number }>(sql`
      SELECT count(*) n FROM ig_posts
      WHERE listing_id = ${s.listing_id}
        AND date(posted_at + 7200, 'unixepoch') = ${s.date}
    `)?.n ?? 0;
    if (hit > 0) accepted++;
  }

  // Site-wide context (7d) for baseline comparison
  const wk = Math.floor(Date.now() / 1000) - 7 * 86400;
  const siteViews7d = (db.get<{ n: number }>(sql`SELECT count(*) n FROM view_events WHERE created_at >= ${wk}`))?.n ?? 0;
  const igViews7d = (db.get<{ n: number }>(sql`SELECT count(*) n FROM view_events WHERE created_at >= ${wk} AND utm_source = 'ig'`))?.n ?? 0;

  // Flywheel legs: follower curve (latest + 30d-ago snapshot) and the
  // audience→sellers leg (active private-seller listings).
  const followersNow = db.get<{ followers_count: number | null; fetched_at: number }>(sql`
    SELECT followers_count, fetched_at FROM ig_account_snapshots ORDER BY fetched_at DESC LIMIT 1
  `);
  const mo = Math.floor(Date.now() / 1000) - 30 * 86400;
  const followers30dAgo = db.get<{ followers_count: number | null }>(sql`
    SELECT followers_count FROM ig_account_snapshots WHERE fetched_at <= ${mo} ORDER BY fetched_at DESC LIMIT 1
  `);
  const privateSellers = (db.get<{ n: number }>(sql`
    SELECT count(*) n FROM listings WHERE status = 'active' AND source = 'own'
  `))?.n ?? 0;

  return new Response(JSON.stringify({
    generated_at: new Date().toISOString(),
    posts: perPost,
    by_model: byModel,
    by_slot: bySlot,
    acceptance: { suggested_days: suggested.length, accepted_days: accepted, rate: suggested.length ? Math.round((accepted / suggested.length) * 100) / 100 : null },
    context: { site_views_7d: siteViews7d, ig_views_7d: igViews7d },
    flywheel: {
      followers: followersNow?.followers_count ?? null,
      followers_30d_ago: followers30dAgo?.followers_count ?? null,
      private_seller_listings: privateSellers,
    },
  }, null, 1), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
