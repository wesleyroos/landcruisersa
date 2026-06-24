// Tracks which content articles (flat MDX posts in src/content/posts) have been
// posted to Instagram. Articles have no database row of their own, so we mirror
// the codebase's existing key/value pattern and store state in site_config under
// `article_posted_<slug>`. (Listings use listings.ig_posted_at; articles use this.)

import { db } from '@/db/index';
import { siteConfig } from '@/db/schema';
import { eq, like } from 'drizzle-orm';

export interface ArticlePostedRecord {
  postedAt: number; // epoch seconds
  mediaId: string;
  caption: string;
  imageUrl: string;
}

const KEY_PREFIX = 'article_posted_';
const keyFor = (slug: string) => `${KEY_PREFIX}${slug}`;

export function getArticlePosted(slug: string): ArticlePostedRecord | null {
  const row = db.select().from(siteConfig).where(eq(siteConfig.key, keyFor(slug))).get();
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value) as ArticlePostedRecord;
  } catch {
    return null;
  }
}

export function isArticlePosted(slug: string): boolean {
  return getArticlePosted(slug) !== null;
}

// slug -> record, for all posted articles (used to annotate the admin list)
export function getPostedArticles(): Record<string, ArticlePostedRecord> {
  const rows = db.select().from(siteConfig).where(like(siteConfig.key, `${KEY_PREFIX}%`)).all();
  const map: Record<string, ArticlePostedRecord> = {};
  for (const row of rows) {
    const slug = row.key.slice(KEY_PREFIX.length);
    try {
      map[slug] = JSON.parse(row.value) as ArticlePostedRecord;
    } catch {
      // ignore malformed entries
    }
  }
  return map;
}

export function setArticlePosted(slug: string, rec: ArticlePostedRecord) {
  const value = JSON.stringify(rec);
  db.insert(siteConfig)
    .values({ key: keyFor(slug), value, updated_at: new Date() })
    .onConflictDoUpdate({ target: siteConfig.key, set: { value, updated_at: new Date() } })
    .run();
}

// Undo a mistaken/deleted IG post so the article reads "not yet posted".
export function clearArticlePosted(slug: string) {
  db.delete(siteConfig).where(eq(siteConfig.key, keyFor(slug))).run();
}

// ─── Failure channel ──────────────────────────────────────────────────────────
// The publish is fire-and-forget (202 + client polls), so a background failure
// would otherwise be invisible. We persist the last error per slug so the status
// endpoint can surface it instead of the client guessing from a 2-minute timeout.

export interface ArticlePostError {
  at: number; // epoch seconds
  message: string;
}

const errKeyFor = (slug: string) => `article_post_error_${slug}`;

export function getArticlePostError(slug: string): ArticlePostError | null {
  const row = db.select().from(siteConfig).where(eq(siteConfig.key, errKeyFor(slug))).get();
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value) as ArticlePostError;
  } catch {
    return null;
  }
}

export function setArticlePostError(slug: string, message: string) {
  const value = JSON.stringify({ at: Math.floor(Date.now() / 1000), message });
  db.insert(siteConfig)
    .values({ key: errKeyFor(slug), value, updated_at: new Date() })
    .onConflictDoUpdate({ target: siteConfig.key, set: { value, updated_at: new Date() } })
    .run();
}

export function clearArticlePostError(slug: string) {
  db.delete(siteConfig).where(eq(siteConfig.key, errKeyFor(slug))).run();
}
