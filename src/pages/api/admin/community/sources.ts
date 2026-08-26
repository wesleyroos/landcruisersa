export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { igSourceAccounts } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin, unauthorized } from '@/lib/admin-auth';

// Manage the watchlist of IG source accounts (add / toggle / remove).
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!requireAdmin(cookies)) return unauthorized();
  let b: any; try { b = await request.json(); } catch { return new Response('{}', { status: 400 }); }

  if (b.action === 'add') {
    const handle = String(b.handle ?? '').replace(/^@/, '').trim().toLowerCase().replace(/[^a-z0-9._]/g, '');
    if (!handle) return new Response(JSON.stringify({ error: 'handle required' }), { status: 400 });
    try {
      db.insert(igSourceAccounts).values({ handle, note: b.note ?? null, active: true, created_at: new Date() })
        .onConflictDoNothing().run();
    } catch { /* ignore dup */ }
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  }
  const id = Number(b.id);
  if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });
  if (b.action === 'remove') db.delete(igSourceAccounts).where(eq(igSourceAccounts.id, id)).run();
  else if (b.action === 'toggle') {
    const row = db.select({ active: igSourceAccounts.active }).from(igSourceAccounts).where(eq(igSourceAccounts.id, id)).get();
    if (row) db.update(igSourceAccounts).set({ active: !row.active }).where(eq(igSourceAccounts.id, id)).run();
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
