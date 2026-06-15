export const prerender = false;

import type { APIRoute } from 'astro';
import { SCRAPER_SOURCES, setSourceScheduled } from '@/lib/scraper-config';

// Browser-origin admin action — cookie/ADMIN_SECRET auth, like every /api/admin/*.
function checkAdmin(cookies: { get(name: string): { value: string } | undefined }): boolean {
  const token = cookies.get('lcsa_admin')?.value;
  const secret = import.meta.env.ADMIN_SECRET ?? process.env.ADMIN_SECRET;
  return Boolean(token && secret && token === secret);
}

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!checkAdmin(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  let body: { source?: string; scheduled?: boolean };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Bad request' }), { status: 400 });
  }
  const { source, scheduled } = body;
  if (!source || !(SCRAPER_SOURCES as readonly string[]).includes(source) || typeof scheduled !== 'boolean') {
    return new Response(JSON.stringify({ error: 'Invalid source or scheduled flag' }), { status: 400 });
  }
  setSourceScheduled(source, scheduled);
  return new Response(JSON.stringify({ ok: true, source, scheduled }), { status: 200 });
};
