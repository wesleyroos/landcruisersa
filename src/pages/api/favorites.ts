export const prerender = false;
import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { favorites, listings } from '@/db/schema';
import { getCurrentUser, unauthorized } from '@/lib/auth-user';
import { rateLimited, clientIp } from '@/lib/rate-limit';
import { sameOrigin } from '@/lib/http-guards';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

async function readSlug(request: Request): Promise<string> {
  try {
    const body = await request.json();
    return String((body as Record<string, unknown>)?.slug ?? '').trim();
  } catch { return ''; }
}

// Add a favourite.
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!sameOrigin(request)) return json({ error: 'Bad origin' }, 403);
  const user = getCurrentUser(cookies);
  if (!user) return unauthorized();
  if (rateLimited(`fav:${user.id}:${clientIp(request)}`, 60, 60 * 1000)) return json({ error: 'Slow down' }, 429);

  const slug = await readSlug(request);
  if (!slug) return json({ error: 'Missing listing' }, 400);

  const [listing] = db.select({ id: listings.id, price: listings.price })
    .from(listings).where(eq(listings.slug, slug)).limit(1).all();
  if (!listing) return json({ error: 'Listing not found' }, 404);

  // Idempotent: the unique (user_id, listing_slug) index makes a repeat save a no-op.
  db.insert(favorites).values({
    user_id: user.id,
    listing_slug: slug,
    listing_id: listing.id,
    baseline_price: listing.price || null,
    created_at: new Date(),
  }).onConflictDoNothing().run();

  return json({ ok: true, saved: true });
};

// Remove a favourite.
export const DELETE: APIRoute = async ({ request, cookies }) => {
  if (!sameOrigin(request)) return json({ error: 'Bad origin' }, 403);
  const user = getCurrentUser(cookies);
  if (!user) return unauthorized();

  const slug = await readSlug(request);
  if (!slug) return json({ error: 'Missing listing' }, 400);

  db.delete(favorites)
    .where(and(eq(favorites.user_id, user.id), eq(favorites.listing_slug, slug)))
    .run();

  return json({ ok: true, saved: false });
};
