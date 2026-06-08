export const prerender = false;

import type { APIRoute } from 'astro';
import { spawn } from 'child_process';
import { join } from 'path';

function checkAdmin(cookies: { get(name: string): { value: string } | undefined }): boolean {
  const token = cookies.get('lcsa_admin')?.value;
  const secret = import.meta.env.ADMIN_SECRET ?? process.env.ADMIN_SECRET;
  return Boolean(token && secret && token === secret);
}

const SCRIPTS = [
  'src/scripts/ingest-autotrader.ts',
  'src/scripts/ingest-wbc.ts',
  'src/scripts/ingest-adios.ts',
];

function runScript(
  script: string,
  env: NodeJS.ProcessEnv,
  send: (data: object) => void,
): Promise<number> {
  return new Promise(resolve => {
    const proc = spawn('node', ['--experimental-strip-types', script], {
      cwd: process.cwd(),
      env,
    });

    const emit = (text: string) => {
      for (const line of text.split('\n').filter(l => l.trim())) {
        send({ type: 'log', script, text: line });
      }
    };

    proc.stdout.on('data', (chunk: Buffer) => emit(chunk.toString()));
    proc.stderr.on('data', (chunk: Buffer) => emit(chunk.toString()));
    proc.on('close', resolve);
  });
}

export const GET: APIRoute = async ({ cookies }) => {
  if (!checkAdmin(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

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
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      send({ type: 'start', scripts: SCRIPTS });

      for (const script of SCRIPTS) {
        const name = script.split('/').pop()!.replace('ingest-', '').replace('.ts', '');
        send({ type: 'script-start', name });
        const code = await runScript(script, childEnv, send);
        send({ type: 'script-done', name, ok: code === 0, code });
      }

      send({ type: 'done' });
      controller.close();
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
