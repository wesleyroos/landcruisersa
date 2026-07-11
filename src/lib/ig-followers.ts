// Live IG follower count for marketing copy (homepage, submit, about).
//
// syncIgInsights() snapshots the account's followers_count into
// ig_account_snapshots daily — read the latest row instead of hardcoding
// numbers in page copy that silently go stale (homepage sat on 18,800 while
// the account was at 19,326; about/ claimed 20,000+).

import { db } from '@/db/index';
import { igAccountSnapshots } from '@/db/schema';
import { isNotNull, desc } from 'drizzle-orm';

// Only used if the snapshots table is empty (fresh DB) or the read fails —
// never let a marketing line render "null followers".
const FALLBACK = 19_300;

export function igFollowers(): number {
  try {
    const row = db.select({ n: igAccountSnapshots.followers_count })
      .from(igAccountSnapshots)
      .where(isNotNull(igAccountSnapshots.followers_count))
      .orderBy(desc(igAccountSnapshots.fetched_at))
      .limit(1).all()[0];
    return row?.n ?? FALLBACK;
  } catch {
    return FALLBACK;
  }
}

// Marketing copy rounds DOWN to the nearest 100 so the number never jitters
// day-to-day and never overstates (a claim we can always back up).

/** e.g. "19,300" */
export function igFollowersDisplay(): string {
  return (Math.floor(igFollowers() / 100) * 100).toLocaleString('en-US');
}

/** e.g. "19.3k" */
export function igFollowersK(): string {
  return `${(Math.floor(igFollowers() / 100) / 10).toFixed(1)}k`;
}
