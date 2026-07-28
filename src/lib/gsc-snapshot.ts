import crypto from 'node:crypto';
import { db } from '@/db/index';
import { gscSnapshots } from '@/db/schema';
import { sql } from 'drizzle-orm';

// Persists Google Search Console query stats to the gsc_snapshots table so we
// keep rank-over-time history. getGscSummary() only ever reads a live trailing
// 28-day window and stores nothing, so query position history is otherwise lost
// the moment it ages out. This writer runs daily (server scheduler + cron backup)
// and captures one row per (date, query).
//
// It fetches a trailing FINALISED window with dimensions ['date','query'] in a
// single API call and UPSERTs every row. That makes it idempotent (safe to run
// repeatedly), self-healing for GSC's late data revisions (the last ~3 days get
// corrected as Google finalises them), and gap-filling if the server missed a day.

const SITE_URL = process.env.GSC_SITE_URL ?? import.meta.env.GSC_SITE_URL ?? 'sc-domain:landcruisersa.co.za';

type ServiceAccount = { client_email: string; private_key: string };

function loadCreds(): ServiceAccount | null {
  const raw = (process.env.GSC_SERVICE_ACCOUNT_JSON ?? import.meta.env.GSC_SERVICE_ACCOUNT_JSON ?? '').trim();
  if (!raw) return null;
  let text = raw;
  if (!text.startsWith('{')) {
    try { text = Buffer.from(text, 'base64').toString('utf8'); } catch { return null; }
  }
  try {
    const c = JSON.parse(text);
    if (!c.client_email || !c.private_key) return null;
    return c;
  } catch { return null; }
}

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

async function getAccessToken(creds: ServiceAccount): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }));
  const signingInput = `${header}.${claim}`;
  let signature: Buffer;
  try {
    signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), creds.private_key);
  } catch { return null; }
  const jwt = `${signingInput}.${b64url(signature)}`;

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });
    if (!res.ok) return null;
    return (await res.json())?.access_token ?? null;
  } catch { return null; }
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export type SnapshotResult =
  | { ok: false; reason: 'unconfigured' | 'auth' | 'error' }
  | { ok: true; rows: number; days: string[] };

/**
 * Snapshot the last `windowDays` finalised GSC days into gsc_snapshots.
 * GSC data lags ~2 days and keeps revising for ~3, so we end the window 2 days
 * back and re-write the trailing days each run (upsert) to catch revisions.
 */
export async function snapshotGscDaily(windowDays = 5): Promise<SnapshotResult> {
  const creds = loadCreds();
  if (!creds) return { ok: false, reason: 'unconfigured' };
  const token = await getAccessToken(creds);
  if (!token) return { ok: false, reason: 'auth' };

  const endDate = ymd(new Date(Date.now() - 2 * 86_400_000));
  const startDate = ymd(new Date(Date.now() - (windowDays + 1) * 86_400_000));

  let rows: any[];
  try {
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE_URL)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate,
          endDate,
          dimensions: ['date', 'query'],
          rowLimit: 5000,
        }),
      },
    );
    if (!res.ok) return { ok: false, reason: 'error' };
    rows = (await res.json())?.rows ?? [];
  } catch {
    return { ok: false, reason: 'error' };
  }

  const capturedAt = new Date();
  const days = new Set<string>();

  let written = 0;
  const tx = db.transaction((records: any[]) => {
    for (const r of records) {
      const date = r.keys?.[0];
      const query = r.keys?.[1];
      if (!date || query == null) continue;
      days.add(date);
      db.insert(gscSnapshots)
        .values({
          date,
          query,
          clicks: Math.round(r.clicks ?? 0),
          impressions: Math.round(r.impressions ?? 0),
          ctr_x10: Math.round((r.ctr ?? 0) * 1000),   // fraction → % ×10
          position_x10: Math.round((r.position ?? 0) * 10),
          captured_at: capturedAt,
        })
        .onConflictDoUpdate({
          target: [gscSnapshots.date, gscSnapshots.query],
          set: {
            clicks: sql`excluded.clicks`,
            impressions: sql`excluded.impressions`,
            ctr_x10: sql`excluded.ctr_x10`,
            position_x10: sql`excluded.position_x10`,
            captured_at: sql`excluded.captured_at`,
          },
        })
        .run();
      written++;
    }
  });
  tx(rows);

  return { ok: true, rows: written, days: [...days].sort() };
}
