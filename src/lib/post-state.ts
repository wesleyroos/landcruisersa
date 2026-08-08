// Runtime publication state for content posts (the flat MDX guides). Posts are
// files, so their FRONTMATTER (draft/unlisted) is the *default* state — but once
// an admin sets a state from /admin/posts, the DB override wins. One decision
// function, `effectiveState`, is consulted everywhere visibility is decided
// (guide page, guides list, homepage, related posts, the IG poster).
//
// Stored in site_config under `post_state_<slug>` (same key/value pattern as
// article-config's IG-posted tracking).

import { db } from '@/db/index';
import { siteConfig } from '@/db/schema';
import { eq, like } from 'drizzle-orm';

export type PostState = 'published' | 'unlisted' | 'draft';
const VALID: readonly PostState[] = ['published', 'unlisted', 'draft'];
export const isPostState = (s: unknown): s is PostState =>
  typeof s === 'string' && (VALID as readonly string[]).includes(s);

const PREFIX = 'post_state_';
const keyFor = (slug: string) => `${PREFIX}${slug}`;

/** The admin-set override for one slug, or null if none. */
export function getStateOverride(slug: string): PostState | null {
  const row = db.select().from(siteConfig).where(eq(siteConfig.key, keyFor(slug))).get();
  return row?.value && isPostState(row.value) ? row.value : null;
}

/** All overrides at once — for list pages / the admin table (single query). */
export function getAllOverrides(): Map<string, PostState> {
  const rows = db.select().from(siteConfig).where(like(siteConfig.key, `${PREFIX}%`)).all();
  const m = new Map<string, PostState>();
  for (const r of rows) if (isPostState(r.value)) m.set(r.key.slice(PREFIX.length), r.value);
  return m;
}

export function setState(slug: string, state: PostState) {
  db.insert(siteConfig)
    .values({ key: keyFor(slug), value: state, updated_at: new Date() })
    .onConflictDoUpdate({ target: siteConfig.key, set: { value: state, updated_at: new Date() } })
    .run();
}

type PostLike = { slug: string; data: { draft?: boolean; unlisted?: boolean } };

/** The frontmatter's implied state — the default when there's no override. */
export function frontmatterState(post: PostLike): PostState {
  if (post.data.draft) return 'draft';
  if (post.data.unlisted) return 'unlisted';
  return 'published';
}

/**
 * THE single source of truth for whether/how a post shows. Pass `override` when
 * you already have the bulk map (avoids a per-post query); omit it for a one-off.
 */
export function effectiveState(post: PostLike, override?: PostState | null): PostState {
  const o = override !== undefined ? override : getStateOverride(post.slug);
  return o ?? frontmatterState(post);
}

export const isListable = (s: PostState) => s === 'published';
export const isPublic   = (s: PostState) => s === 'published' || s === 'unlisted'; // reachable by URL
export const isNoindex  = (s: PostState) => s !== 'published';
