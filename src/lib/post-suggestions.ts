import { db } from '@/db/index';
import { listings, viewEvents } from '@/db/schema';
import { and, eq, gt, sql, isNull } from 'drizzle-orm';
import { getRecentPriceChanges } from './price-changes';

// ─── "What should we post to IG today?" ──────────────────────────────────────
// Deterministic scoring over the signals that picked winners by hand:
//   demand   — model views + the listing's own views (last 7 days)
//   hook     — recent price drop (size matters; it's the caption angle)
//   quality  — photo count, fresh listing, real description
//   rotation — penalise the model we posted most recently, so the posting mix
//              keeps testing segments instead of repeating one
// Weights are intentionally simple and explainable; they get tuned over time
// against measured outcomes (clicks per posted segment).

export interface PostSuggestion {
  id: number;
  slug: string;
  title: string;
  model: string;
  price: number;
  province: string;
  photoCount: number;
  dropAmount: number;     // rands, 0 if none
  score: number;
  reasons: string[];
}

export function getPostSuggestions(limit = 3): PostSuggestion[] {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  // Candidates: active, for sale, priced, decent photos, never posted to IG
  const candidates = db.select({
    id: listings.id,
    slug: listings.slug,
    title: listings.title,
    model: listings.model,
    price: listings.price,
    province: listings.province,
    created_at: listings.created_at,
    description: listings.description,
    photoCount: sql<number>`json_array_length(photos)`,
  }).from(listings)
    .where(and(
      eq(listings.status, 'active'),
      eq(listings.listing_type, 'for_sale'),
      gt(listings.price, 0),
      isNull(listings.ig_posted_at),
      sql`json_array_length(photos) >= 4`,
    ))
    .all();

  if (candidates.length === 0) return [];

  // Demand signals (7d)
  const modelViews = new Map(
    db.select({ model: viewEvents.model, n: sql<number>`count(*)` })
      .from(viewEvents)
      .where(and(gt(viewEvents.created_at, weekAgo), sql`model IS NOT NULL`))
      .groupBy(viewEvents.model).all()
      .map(r => [r.model!, r.n]),
  );
  const slugViews = new Map(
    db.select({ slug: viewEvents.listing_slug, n: sql<number>`count(*)` })
      .from(viewEvents)
      .where(gt(viewEvents.created_at, weekAgo))
      .groupBy(viewEvents.listing_slug).all()
      .map(r => [r.slug, r.n]),
  );

  // Price drops (net 30d)
  const changes = getRecentPriceChanges();

  // Rotation: models of the two most recent IG posts get penalised
  const recentlyPostedModels = db.select({ model: listings.model })
    .from(listings)
    .where(sql`ig_posted_at IS NOT NULL`)
    .orderBy(sql`ig_posted_at DESC`)
    .limit(2)
    .all()
    .map(r => r.model);

  const now = Date.now();
  const scored: PostSuggestion[] = candidates.map(c => {
    let score = 0;
    const reasons: string[] = [];

    const mv = modelViews.get(c.model) ?? 0;
    if (mv > 0) { score += mv * 2; reasons.push(`${c.model.replace(/-/g, ' ')} demand: ${mv} views this week`); }

    const sv = slugViews.get(c.slug) ?? 0;
    if (sv > 0) { score += sv * 3; reasons.push(`listing itself viewed ${sv}× this week`); }

    const change = changes.get(c.slug) ?? 0;
    const dropAmount = change < 0 ? Math.abs(change) : 0;
    if (dropAmount > 0) {
      score += 25 + Math.min(40, dropAmount / 1000);
      reasons.push(`price drop hook: R${dropAmount.toLocaleString('en-ZA')} off`);
    }

    if (c.photoCount >= 8) { score += 15; reasons.push(`${c.photoCount} photos`); }
    else if (c.photoCount >= 5) { score += 8; }

    const ageDays = (now - c.created_at.getTime()) / 86_400_000;
    if (ageDays <= 7) { score += 10; reasons.push('freshly listed'); }

    if ((c.description ?? '').length >= 200) score += 5;

    if (recentlyPostedModels.includes(c.model)) {
      score -= 25;
      reasons.push('recently posted this model (rotation penalty)');
    }

    return {
      id: c.id, slug: c.slug, title: c.title, model: c.model,
      price: c.price, province: c.province ?? '',
      photoCount: c.photoCount, dropAmount, score: Math.round(score), reasons,
    };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
