export const prerender = false;
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { users } from '@/db/schema';
import { verifyScoped } from '@/lib/token';

// One-click unsubscribe from alert emails. Driven by the confirm button on
// /unsubscribe (a POST, so an email client prefetching the link can't silently
// unsubscribe). Clears consent_at — which removes the user from the eligible set
// in runAlertSweep — without touching their account or saved vehicles.
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData().catch(() => null);
  const token = String(form?.get('token') ?? '');
  const payload = verifyScoped<{ uid: number }>('unsub', token);
  if (!payload || typeof payload.uid !== 'number') {
    return redirect('/unsubscribe/?error=link');
  }

  db.update(users).set({ consent_at: null }).where(eq(users.id, payload.uid)).run();
  return redirect('/unsubscribe/?done=1');
};
