export const prerender = false;

import type { APIRoute } from 'astro';
import { requireAdmin, unauthorized } from '@/lib/admin-auth';
import { captureBuildFromBytes } from '@/lib/ig-community';

// Bulletproof capture: an uploaded image file (a screenshot / saved photo) +
// the owner handle. Needs nothing from Instagram — the file is already in the
// admin's hands. Multipart form: image=<file>, handle=<text>, source=<url?>.
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!requireAdmin(cookies)) return unauthorized();

  let form: FormData;
  try { form = await request.formData(); } catch { return new Response(JSON.stringify({ error: 'expected multipart form' }), { status: 400 }); }

  const file = form.get('image');
  const handle = String(form.get('handle') ?? '');
  const source = String(form.get('source') ?? '') || undefined;
  if (!(file instanceof File)) return new Response(JSON.stringify({ error: 'image file required' }), { status: 400 });
  if (file.size > 12_000_000) return new Response(JSON.stringify({ error: 'image too large (max 12MB)' }), { status: 400 });

  const body = Buffer.from(await file.arrayBuffer());
  const result = await captureBuildFromBytes(body, file.type || 'image/jpeg', handle, source);
  if (!result.ok) return new Response(JSON.stringify({ error: result.error }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  return new Response(JSON.stringify({ ok: true, id: result.build.id, slug: result.build.slug }), { headers: { 'Content-Type': 'application/json' } });
};
