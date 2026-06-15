export const prerender = false;

import type { APIRoute } from 'astro';
import { sendPostSuggestionEmail } from '@/lib/post-suggestion-email';

// Daily IG post suggestion — kept as a deduped BACKUP to the server-side
// scheduler (src/lib/post-suggestion-scheduler.ts). The Fly server fires the
// email at 07:00 SAST; this GitHub-cron route catches the rare case where the
// server was mid-deploy at that moment. The once-a-day guard in
// sendPostSuggestionEmail() ensures only one email goes out per day.
export const POST: APIRoute = async ({ request }) => {
  const auth = request.headers.get('authorization') ?? '';
  const token = import.meta.env.INGEST_TOKEN ?? process.env.INGEST_TOKEN;
  if (!token || auth !== `Bearer ${token}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { emailed, skipped, suggestions } = await sendPostSuggestionEmail();

  return new Response(JSON.stringify({ ok: true, emailed, skipped, suggestions }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
