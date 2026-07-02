import crypto from 'node:crypto';

// Google Search Console summary for /admin/analytics. GSC gives us the one thing
// Plausible can't: the actual search QUERIES we rank for — clicks, impressions,
// CTR and average position — plus the content-gap view (high impressions, low
// clicks = demand we're not yet capturing). Auth is a service account: we sign a
// JWT with the private key (Node's built-in crypto, no extra deps), exchange it
// for an access token, then hit the Search Analytics API. The key is read
// server-side only and must never reach the browser.

// Domain property by default ("sc-domain:" prefix); override with a URL-prefix
// property (e.g. "https://landcruisersa.co.za/") via env if needed.
const SITE_URL = process.env.GSC_SITE_URL ?? import.meta.env.GSC_SITE_URL ?? 'sc-domain:landcruisersa.co.za';

const TYRE_PATTERN = /tyre|tire|wheel|rim|all.?terrain|\bat\b|\bmt\b|mud.?terrain/i;
export const isTyreQuery = (q: string) => TYRE_PATTERN.test(q);

// Clothing / apparel demand we currently have NOTHING to serve — the merch gap.
// Deliberately excludes "seat cover"/"floor mat" (vehicle trim, not apparel).
const CLOTHING_PATTERN = /clothing|apparel|shirt|t.?shirt|\btee\b|jacket|hoodie|jersey|jumper|sweater|\bcap\b|\bhat\b|beanie|merch|clothes|\bwear\b|overall|golf ?shirt/i;
export const isClothingQuery = (q: string) => CLOTHING_PATTERN.test(q);

type ServiceAccount = { client_email: string; private_key: string };

// Accepts either raw JSON or base64-encoded JSON (base64 is the safe way to put
// the multi-line key into a Fly secret: `fly secrets set GSC_SERVICE_ACCOUNT_JSON=$(base64 < key.json)`).
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

export type GscRow = { key: string; clicks: number; impressions: number; ctr: number; position: number };

async function query(token: string, body: Record<string, unknown>): Promise<GscRow[]> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE_URL)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) return [];
    const rows = (await res.json())?.rows ?? [];
    return rows.map((r: any) => ({
      key: r.keys?.[0] ?? '',
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      ctr: Math.round((r.ctr ?? 0) * 1000) / 10, // % to 1dp
      position: Math.round((r.position ?? 0) * 10) / 10,
    }));
  } catch { return []; }
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export type GscSummary = Awaited<ReturnType<typeof getGscSummary>>;

export async function getGscSummary() {
  const creds = loadCreds();
  if (!creds) return { configured: false as const };
  const token = await getAccessToken(creds);
  if (!token) return { configured: true as const, authOk: false as const };

  // GSC data lags ~2 days; query a 28-day window ending 3 days ago.
  const endDate = ymd(new Date(Date.now() - 3 * 86_400_000));
  const startDate = ymd(new Date(Date.now() - 31 * 86_400_000));
  const range = { startDate, endDate };

  const [queries, pages] = await Promise.all([
    query(token, { ...range, dimensions: ['query'], rowLimit: 250 }),
    query(token, { ...range, dimensions: ['page'], rowLimit: 100 }),
  ]);

  const totals = queries.reduce(
    (a, r) => ({ clicks: a.clicks + r.clicks, impressions: a.impressions + r.impressions }),
    { clicks: 0, impressions: 0 },
  );

  const topQueries = [...queries].sort((a, b) => b.clicks - a.clicks).slice(0, 20);

  // Content gaps: real demand (impressions) we're barely capturing — ranked off
  // page 1 (position > 10) with few clicks. Sorted by impressions = biggest miss.
  const contentGaps = queries
    .filter(r => r.impressions >= 20 && r.position > 10 && r.clicks <= 2)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 20);

  const tyreQueries = queries
    .filter(r => isTyreQuery(r.key))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 20);

  // Clothing gap: demand we're getting impressions for but have no product to
  // satisfy. Aggregate totals make the pitch — X impressions, ~0 clicks, because
  // there's nothing to click through to.
  const clothingRows = queries.filter(r => isClothingQuery(r.key));
  const clothingQueries = [...clothingRows].sort((a, b) => b.impressions - a.impressions).slice(0, 20);
  const clothing = {
    queryCount: clothingRows.length,
    impressions: clothingRows.reduce((a, r) => a + r.impressions, 0),
    clicks: clothingRows.reduce((a, r) => a + r.clicks, 0),
  };

  const topPages = [...pages].sort((a, b) => b.clicks - a.clicks).slice(0, 15);

  return {
    configured: true as const,
    authOk: true as const,
    range,
    totals,
    avgCtr: totals.impressions > 0 ? Math.round((totals.clicks / totals.impressions) * 1000) / 10 : 0,
    topQueries,
    contentGaps,
    tyreQueries,
    clothingQueries,
    clothing,
    topPages,
  };
}
