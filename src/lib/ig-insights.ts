import { db } from '@/db/index';
import { listings, igPosts, igPostMetrics, igAccountSnapshots } from '@/db/schema';
import { sql, isNotNull, and } from 'drizzle-orm';
import { getCredentials } from './instagram';

// ─── IG insights sync — closes the Hero Engine's feedback loop ────────────────
// Pulls per-post Graph API insights (views/reach/saves/shares/… and, where the
// account exposes them, follows + profile visits) into ig_post_metrics as daily
// snapshots while a post is < 30 days old. This is the engine's actual target
// variable — audience growth — replacing the manual monthly Meta CSV export and
// the site-click proxies the old tuning loop ran on.
//
// Also backfills: listings posted before ig_posts existed get a row (slot
// 'legacy') by matching their ig_posted_at against the media list's timestamps
// (±2 min) — the same trick the admin Posted view already used ad hoc.

const IG_API = 'https://graph.instagram.com/v21.0';
const SYNC_WINDOW_DAYS = 30;

// Requested best-case; some metrics 400 depending on API version/account type,
// so on failure we retry with the safe core set and leave the rest null.
const METRICS_FULL = 'views,reach,saved,shares,follows,profile_visits,total_interactions';
const METRICS_SAFE = 'views,reach,saved,shares';

interface MediaListItem { id: string; timestamp: string; like_count?: number; comments_count?: number }

async function fetchMediaList(userId: string, accessToken: string): Promise<MediaListItem[]> {
  const res = await fetch(
    `${IG_API}/${userId}/media?fields=id,timestamp,like_count,comments_count&limit=100&access_token=${accessToken}`,
  );
  const json = await res.json();
  if (!res.ok || !Array.isArray(json.data)) throw new Error(json.error?.message ?? 'media list fetch failed');
  return json.data;
}

async function fetchInsights(mediaId: string, accessToken: string): Promise<Record<string, number>> {
  const tryMetrics = async (metrics: string) => {
    const res = await fetch(`${IG_API}/${mediaId}/insights?metric=${metrics}&period=lifetime&access_token=${accessToken}`);
    const json = await res.json();
    if (!res.ok || !Array.isArray(json.data)) throw new Error(json.error?.message ?? 'insights fetch failed');
    const out: Record<string, number> = {};
    for (const d of json.data) out[d.name] = d.values?.[0]?.value ?? d.value ?? 0;
    return out;
  };
  try {
    return await tryMetrics(METRICS_FULL);
  } catch {
    return await tryMetrics(METRICS_SAFE);
  }
}

export interface IgSyncResult {
  backfilled: number;
  synced: number;
  failed: number;
}

export async function syncIgInsights(): Promise<IgSyncResult | null> {
  const creds = await getCredentials();
  if (!creds) return null;

  const media = await fetchMediaList(creds.userId, creds.accessToken);
  const byId = new Map(media.map(m => [m.id, m]));

  // Account-level snapshot — the flywheel's headline metric (follower curve vs
  // posting cadence). Non-fatal: per-post sync still runs if this call fails.
  try {
    const res = await fetch(`${IG_API}/me?fields=followers_count,media_count&access_token=${creds.accessToken}`);
    const acc = await res.json();
    if (res.ok) {
      db.insert(igAccountSnapshots).values({
        fetched_at: new Date(),
        followers_count: acc.followers_count ?? null,
        media_count: acc.media_count ?? null,
      }).run();
    }
  } catch (e) {
    console.error('[ig-insights] account snapshot failed:', e instanceof Error ? e.message : e);
  }

  // ── Backfill: posted listings with no ig_posts row → match by timestamp ──
  let backfilled = 0;
  const linkedListingIds = new Set(
    db.select({ id: igPosts.listing_id }).from(igPosts).where(isNotNull(igPosts.listing_id)).all().map(r => r.id!),
  );
  const posted = db.select({
    id: listings.id, slug: listings.slug, ig_posted_at: listings.ig_posted_at, ig_media_id: listings.ig_media_id,
  }).from(listings).where(isNotNull(listings.ig_posted_at)).all();

  for (const l of posted) {
    if (linkedListingIds.has(l.id)) continue;
    let mediaId = l.ig_media_id;
    if (!mediaId) {
      const ourMs = l.ig_posted_at!.getTime();
      const match = media.find(m => Math.abs(new Date(m.timestamp).getTime() - ourMs) < 2 * 60 * 1000);
      mediaId = match?.id ?? null;
    }
    // Log the row even without a media match (keeps the slot planner's history
    // complete); metrics simply stay unavailable for it.
    db.insert(igPosts).values({
      listing_id: l.id, slug: l.slug, slot: 'legacy', media_id: mediaId, posted_at: l.ig_posted_at!,
    }).run();
    if (mediaId && !l.ig_media_id) {
      db.update(listings).set({ ig_media_id: mediaId }).where(sql`id = ${l.id}`).run();
    }
    backfilled++;
  }

  // ── Snapshot every tracked post inside the sync window ──
  const since = new Date(Date.now() - SYNC_WINDOW_DAYS * 86_400_000);
  const toSync = db.select({ media_id: igPosts.media_id })
    .from(igPosts)
    .where(and(isNotNull(igPosts.media_id), sql`posted_at >= ${Math.floor(since.getTime() / 1000)}`))
    .all();

  let synced = 0, failed = 0;
  for (const row of toSync) {
    const mediaId = row.media_id!;
    try {
      const ins = await fetchInsights(mediaId, creds.accessToken);
      const listItem = byId.get(mediaId);
      db.insert(igPostMetrics).values({
        media_id: mediaId,
        fetched_at: new Date(),
        views: ins.views ?? null,
        reach: ins.reach ?? null,
        likes: listItem?.like_count ?? null,
        comments: listItem?.comments_count ?? null,
        saves: ins.saved ?? null,
        shares: ins.shares ?? null,
        profile_visits: ins.profile_visits ?? null,
        follows: ins.follows ?? null,
        total_interactions: ins.total_interactions ?? null,
      }).run();
      synced++;
    } catch (e) {
      failed++;
      console.error(`[ig-insights] media ${mediaId} failed:`, e instanceof Error ? e.message : e);
    }
  }

  console.log(`[ig-insights] backfilled ${backfilled}, snapshots ${synced}, failed ${failed}`);
  return { backfilled, synced, failed };
}

// Once-a-day guard (mirrors the morning-email pattern; single writer, so a
// simple read-then-write is fine here).
const LAST_SYNC_KEY = 'ig_insights_last_sync';

export async function syncIgInsightsDaily(): Promise<IgSyncResult | null> {
  const today = new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10); // SAST
  const last = db.get<{ value: string }>(sql`SELECT value FROM site_config WHERE key = ${LAST_SYNC_KEY}`)?.value;
  if (last === today) return null;
  const result = await syncIgInsights();
  if (result) {
    db.run(sql`
      INSERT INTO site_config (key, value, updated_at) VALUES (${LAST_SYNC_KEY}, ${today}, ${Math.floor(Date.now() / 1000)})
      ON CONFLICT(key) DO UPDATE SET value = ${today}, updated_at = ${Math.floor(Date.now() / 1000)}
    `);
  }
  return result;
}
