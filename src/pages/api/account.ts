export const prerender = false;
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { users } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth-user';

// Update the signed-in user's own profile (name only, for now). Form-posts and
// redirects back to /account so it works without JS.
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const user = getCurrentUser(cookies);
  if (!user) return redirect('/signin/?next=/account/');

  const form = await request.formData().catch(() => null);
  const name = String(form?.get('name') ?? '').trim().slice(0, 120);
  db.update(users).set({ name: name || null }).where(eq(users.id, user.id)).run();

  return redirect('/account/');
};
