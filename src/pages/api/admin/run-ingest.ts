export const prerender = false;

import type { APIRoute } from 'astro';
import { spawn } from 'child_process';
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

// Jimny only exists on these sources — Adios is a Land Cruiser specialist and
// We Buy Bakkies carries bakkies/LDVs, neither has Jimny stock. Mirrors
// scripts/jimny-scrape.sh.
const JIMNY_SOURCES = new Set(['autotrader', 'carsza', 'wbc']);

const VALID_SEGMENTS = new Set(['land-cruiser', 'jimny']);

// ── Per-segment env. Resolve each var explicitly (import.meta.env ?? process.env)
// so the spawned children hit the right target regardless of how .env is loaded. ──

function landCruiserEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    SITE_URL:     import.meta.env.SITE_URL     ?? process.env.SITE_URL     ?? 'http://localhost:4321',
    INGEST_TOKEN: import.meta.env.INGEST_TOKEN ?? process.env.INGEST_TOKEN ?? '',
  };
}

function jimnyEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    SCRAPE_SEGMENT: 'jimny',
    SITE_URL:       import.meta.env.JIMNY_SITE_URL     ?? process.env.JIMNY_SITE_URL     ?? 'https://jimnysa.fly.dev',
    INGEST_TOKEN:   import.meta.env.JIMNY_INGEST_TOKEN ?? process.env.JIMNY_INGEST_TOKEN ?? '',
  };
}

// rehost-at-images.ts reads the generic R2_* vars — map jimnysa's bucket onto them.
function jimnyR2Env(): NodeJS.ProcessEnv {
  return {
    ...jimnyEnv(),
    R2_ENDPOINT:          import.meta.env.JIMNY_R2_ENDPOINT          ?? process.env.JIMNY_R2_ENDPOINT,
    R2_PUBLIC_URL:        import.meta.env.JIMNY_R2_PUBLIC_URL        ?? process.env.JIMNY_R2_PUBLIC_URL,
    R2_BUCKET:            import.meta.env.JIMNY_R2_BUCKET            ?? process.env.JIMNY_R2_BUCKET,
    R2_ACCESS_KEY_ID:     import.meta.env.JIMNY_R2_ACCESS_KEY_ID     ?? process.env.JIMNY_R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: import.meta.env.JIMNY_R2_SECRET_ACCESS_KEY ?? process.env.JIMNY_R2_SECRET_ACCESS_KEY,
  };
}

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
        // Scripts emit `PROGRESS::{json}` for the progress bar; everything else is a log line.
        if (line.startsWith('PROGRESS::')) {
          try { send({ type: 'progress', script, ...JSON.parse(line.slice(10)) }); continue; } catch { /* fall through */ }
        }
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

  // ?segments=land-cruiser,jimny — defaults to land-cruiser (back-compat)
  const segmentsParam = url.searchParams.get('segments');
  const segments = (segmentsParam ? segmentsParam.split(',') : ['land-cruiser'])
    .map(s => s.trim())
    .filter(s => VALID_SEGMENTS.has(s));

  // ?sources=wbb,autotrader — defaults to all
  const sourcesParam = url.searchParams.get('sources');
  const selectedSources = sourcesParam
    ? sourcesParam.split(',').map(s => s.trim()).filter(s => s in ALL_SCRIPTS)
    : Object.keys(ALL_SCRIPTS);

  if (!segments.length || !selectedSources.length) {
    return new Response(JSON.stringify({ error: 'Nothing to run' }), { status: 400 });
  }

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

      send({ type: 'start', segments, sources: selectedSources });

      for (const segment of segments) {
        if (closed) break;
        send({ type: 'segment-start', segment });

        const sources = segment === 'jimny'
          ? selectedSources.filter(s => JIMNY_SOURCES.has(s))
          : selectedSources;
        const env = segment === 'jimny' ? jimnyEnv() : landCruiserEnv();

        for (const src of sources) {
          if (closed) break;
          send({ type: 'script-start', name: src, segment });
          const code = await runScript(ALL_SCRIPTS[src], env, send, p => { activeChild = p; });
          send({ type: 'script-done', name: src, segment, ok: code === 0, code });
        }

        // Jimny post-steps: fill AutoTrader photo galleries, then rehost AT images
        // to jimnysa's R2 (AT's CDN rate-limits hotlinks). Only meaningful when
        // AutoTrader was crawled. Mirrors scripts/jimny-scrape.sh.
        if (segment === 'jimny' && !closed && sources.includes('autotrader')) {
          send({ type: 'script-start', name: 'gallery-backfill', segment });
          const bfEnv = { ...jimnyEnv(), BACKFILL_SEGMENTS: 'jimny', BATCH_SIZE: '120', DELAY_MS: '3000' };
          const bfCode = await runScript('scripts/backfill-at-images.ts', bfEnv, send, p => { activeChild = p; });
          send({ type: 'script-done', name: 'gallery-backfill', segment, ok: bfCode === 0, code: bfCode });

          if (!closed) {
            send({ type: 'script-start', name: 'image-rehost', segment });
            const rhCode = await runScript('src/scripts/rehost-at-images.ts', jimnyR2Env(), send, p => { activeChild = p; });
            send({ type: 'script-done', name: 'image-rehost', segment, ok: rhCode === 0, code: rhCode });
          }
        }
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
