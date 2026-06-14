export const prerender = false;

import type { APIRoute } from 'astro';
import { spawn } from 'child_process';
import { join } from 'path';
import { writeFileSync } from 'fs';

function checkAdmin(cookies: { get(name: string): { value: string } | undefined }): boolean {
  const token = cookies.get('lcsa_admin')?.value;
  const secret = import.meta.env.ADMIN_SECRET ?? process.env.ADMIN_SECRET;
  return Boolean(token && secret && token === secret);
}

const ALL_SCRIPTS: Record<string, string> = {
  autotrader: 'src/scripts/ingest-autotrader.ts',
  wbc:        'src/scripts/ingest-wbc.ts',
  adios:      'src/scripts/ingest-adios.ts',
  wbb:        'src/scripts/ingest-wbb.ts',
  carsza:     'src/scripts/ingest-carsza.ts',
};

function runScript(
  script: string,
  env: NodeJS.ProcessEnv,
  send: (data: object) => void,
  registerChild: (proc: ReturnType<typeof spawn> | null) => void,
): Promise<number> {
  return new Promise(resolve => {
    const proc = spawn('node', ['--experimental-strip-types', script], {
      cwd: process.cwd(),
      env,
    });
    registerChild(proc);

    const emit = (text: string) => {
      for (const line of text.split('\n').filter(l => l.trim())) {
        send({ type: 'log', script, text: line });
      }
    };

    proc.stdout.on('data', (chunk: Buffer) => emit(chunk.toString()));
    proc.stderr.on('data', (chunk: Buffer) => emit(chunk.toString()));
    proc.on('close', code => { registerChild(null); resolve(code ?? 0); });
    proc.on('error', () => { registerChild(null); resolve(1); });
  });
}

export const GET: APIRoute = async ({ cookies, url, request }) => {
  if (!checkAdmin(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  // Optional ?sources=wbb,autotrader — defaults to all
  const sourcesParam = url.searchParams.get('sources');
  const selected = sourcesParam
    ? sourcesParam.split(',').map(s => s.trim()).filter(s => s in ALL_SCRIPTS)
    : Object.keys(ALL_SCRIPTS);

  const scripts = selected.map(s => ALL_SCRIPTS[s]);

  const siteUrl  = import.meta.env.SITE_URL  ?? process.env.SITE_URL  ?? 'http://localhost:4321';
  const ingestToken = import.meta.env.INGEST_TOKEN ?? process.env.INGEST_TOKEN ?? '';

  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    SITE_URL: siteUrl,
    INGEST_TOKEN: ingestToken,
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // The client (browser SSE) can disconnect mid-ingest — closing the page,
      // navigating away, or just letting the ingest finish. The spawned child
      // keeps emitting after that, so every write must be guarded or enqueueing
      // on a closed controller throws an uncaught error and kills the server.
      let closed = false;
      let activeChild: ReturnType<typeof spawn> | null = null;

      const send = (data: object) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true; // controller already gone — stop writing
        }
      };

      const onAbort = () => {
        closed = true;
        activeChild?.kill();           // stop the ingest if the client left
      };
      request.signal.addEventListener('abort', onAbort);

      send({ type: 'start', scripts });

      for (const script of scripts) {
        if (closed) break;
        const name = script.split('/').pop()!.replace('ingest-', '').replace('.ts', '');
        send({ type: 'script-start', name });
        const code = await runScript(script, childEnv, send, p => { activeChild = p; });
        send({ type: 'script-done', name, ok: code === 0, code });
      }

      request.signal.removeEventListener('abort', onAbort);
      try { writeFileSync('/tmp/lcsa-poll.log', new Date().toISOString()); } catch {}
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
