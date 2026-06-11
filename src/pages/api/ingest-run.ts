export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/index';
import { ingestRuns } from '@/db/schema';

function checkToken(request: Request): boolean {
  const auth = request.headers.get('authorization') ?? '';
  const token = import.meta.env.INGEST_TOKEN ?? process.env.INGEST_TOKEN;
  if (!token) return false;
  return auth === `Bearer ${token}`;
}

// Ingest scripts report a run summary here — powers the admin Scrapers page
export const POST: APIRoute = async ({ request }) => {
  if (!checkToken(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { source, found, created, updated, skipped, removed, ok, note } = body;
  if (!source) {
    return new Response(JSON.stringify({ error: 'Missing source' }), { status: 400 });
  }

  await db.insert(ingestRuns).values({
    source:  String(source),
    found:   Number(found ?? 0),
    created: Number(created ?? 0),
    updated: Number(updated ?? 0),
    skipped: Number(skipped ?? 0),
    removed: Number(removed ?? 0),
    ok:      ok !== false,
    note:    note ? String(note) : null,
    run_at:  new Date(),
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
