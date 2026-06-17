export const prerender = false;

import type { APIRoute } from 'astro';
import { spawn } from 'child_process';

function checkAdmin(cookies: { get(name: string): { value: string } | undefined }): boolean {
  const token = cookies.get('lcsa_admin')?.value;
  const secret = import.meta.env.ADMIN_SECRET ?? process.env.ADMIN_SECRET;
  return Boolean(token && secret && token === secret);
}

// AT image backfill button. Spawns the SAME canonical script the daily cron
// runs (scripts/backfill-at-images.ts) against PROD — so the button and the
// scheduled run share one code path. Every protection (503/soft-block abort,
// Land-Cruiser-only segment gate, health reporting to /admin/scrapers) lives in
// the script and therefore applies here too. This endpoint is a thin streamer;
// it never touches the local dev DB.
export const GET: APIRoute = async ({ cookies, request }) => {
  if (!checkAdmin(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const siteUrl = import.meta.env.SITE_URL ?? process.env.SITE_URL ?? 'https://landcruisersa.co.za';
  const ingestToken = import.meta.env.INGEST_TOKEN ?? process.env.INGEST_TOKEN ?? '';
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    SITE_URL: siteUrl,
    INGEST_TOKEN: ingestToken,
    // Match the cron's polite settings so button and schedule behave identically.
    BATCH_SIZE: process.env.BATCH_SIZE ?? '80',
    DELAY_MS: process.env.DELAY_MS ?? '3500',
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let child: ReturnType<typeof spawn> | null = null;

      const send = (data: object) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); }
        catch { closed = true; }
      };
      const onAbort = () => { closed = true; child?.kill(); };
      request.signal.addEventListener('abort', onAbort);

      send({ type: 'start' });

      const proc = spawn('node', ['--experimental-strip-types', 'scripts/backfill-at-images.ts'], {
        cwd: process.cwd(),
        env: childEnv,
      });
      child = proc;

      const emit = (text: string) => {
        for (const line of text.split('\n').filter(l => l.trim())) send({ type: 'log', text: line });
      };
      proc.stdout.on('data', (c: Buffer) => emit(c.toString()));
      proc.stderr.on('data', (c: Buffer) => emit(c.toString()));

      await new Promise<number>(resolve => {
        proc.on('close', code => resolve(code ?? 0));
        proc.on('error', () => resolve(1));
      });

      request.signal.removeEventListener('abort', onAbort);
      send({ type: 'done' });
      if (!closed) { try { controller.close(); } catch { /* already closed */ } }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
};
