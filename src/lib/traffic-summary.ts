import { db } from '@/db/index';
import { sql } from 'drizzle-orm';

// Server-side traffic + conversion summary for /admin/analytics. Joins Plausible
// (web traffic) with our own SQLite (business outcomes) to answer the things the
// embedded Plausible dashboard can't: how much traffic is LLM-referred (the
// AI-search thesis's leading indicator) and how traffic converts to valuations,
// enquiries and finance leads. The Plausible API key is read server-side only —
// it must never reach the browser.

const SITE_ID = 'landcruisersa.co.za';
const PLAUSIBLE_KEY = import.meta.env.PLAUSIBLE_API_KEY ?? process.env.PLAUSIBLE_API_KEY ?? '';

// Sources Plausible attributes to LLM assistants. Matched case-insensitively as
// substrings so new labels (e.g. "Google Gemini", "Microsoft Copilot") still hit.
const AI_PATTERN = /chatgpt|openai|gemini|copilot|perplexity|claude|anthropic|you\.com|\bpoe\b|phind|mistral|deepseek|grok|bard/i;
export const isAiSource = (s: string) => AI_PATTERN.test(s);

type Json = Record<string, any>;

async function plausible(endpoint: string, params: Record<string, string>): Promise<Json | null> {
  if (!PLAUSIBLE_KEY) return null;
  const qs = new URLSearchParams({ site_id: SITE_ID, ...params }).toString();
  try {
    const res = await fetch(`https://plausible.io/api/v1/stats/${endpoint}?${qs}`, {
      headers: { Authorization: `Bearer ${PLAUSIBLE_KEY}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

// DB row count since `days` ago. created_at is stored as unix seconds.
function countSince(table: string, days: number): number {
  const since = Math.floor((Date.now() - days * 86_400_000) / 1000);
  const row = db.get<{ n: number }>(sql.raw(`SELECT count(*) n FROM ${table} WHERE created_at >= ${since}`));
  return row?.n ?? 0;
}

async function visitorsFor(params: Record<string, string>): Promise<number> {
  const r = await plausible('aggregate', { metrics: 'visitors', ...params });
  return r?.results?.visitors?.value ?? 0;
}

// Sum visitors from an LLM-source breakdown over the given Plausible period.
async function aiVisitors(params: Record<string, string>): Promise<{ total: number; sources: { source: string; visitors: number }[] }> {
  const r = await plausible('breakdown', { property: 'visit:source', metrics: 'visitors', limit: '100', ...params });
  const rows: { source: string; visitors: number }[] = r?.results ?? [];
  const ai = rows.filter(x => isAiSource(x.source));
  return { total: ai.reduce((s, x) => s + (x.visitors ?? 0), 0), sources: ai.sort((a, b) => b.visitors - a.visitors) };
}

// First-party LLM-citation data from our own ai_referrals table — the thing
// Plausible can't give us: WHICH guide each LLM cited. Wrapped so a missing table
// (e.g. local dev) never breaks the page.
function aiReferralsFirstParty() {
  const secs = (days: number) => Math.floor((Date.now() - days * 86_400_000) / 1000);
  const s7 = secs(7), s14 = secs(14), s30 = secs(30);
  const n = (q: string) => db.get<{ n: number }>(sql.raw(q))?.n ?? 0;
  try {
    return {
      last7: n(`SELECT count(*) n FROM ai_referrals WHERE created_at >= ${s7}`),
      prior7: n(`SELECT count(*) n FROM ai_referrals WHERE created_at >= ${s14} AND created_at < ${s7}`),
      d30: n(`SELECT count(*) n FROM ai_referrals WHERE created_at >= ${s30}`),
      bySource: db.all<{ source: string; n: number }>(sql.raw(
        `SELECT source, count(*) n FROM ai_referrals WHERE created_at >= ${s30} GROUP BY source ORDER BY n DESC`)),
      topPages: db.all<{ landing_path: string; n: number }>(sql.raw(
        `SELECT landing_path, count(*) n FROM ai_referrals WHERE created_at >= ${s30} AND landing_path IS NOT NULL GROUP BY landing_path ORDER BY n DESC LIMIT 8`)),
    };
  } catch {
    return { last7: 0, prior7: 0, d30: 0, bySource: [], topPages: [] };
  }
}

// Per-page bounce rate + visitors for a set of paths — used by the read-only
// report endpoint so scheduled ledger reviews can score conversion bets (Tier 3
// CTAs aim to drop bounce by routing readers to a second page).
export async function pageBounceRates(paths: string[], period = '30d') {
  return Promise.all(paths.map(async (page) => {
    const r = await plausible('aggregate', {
      period, metrics: 'visitors,bounce_rate', filters: `event:page==${page}`,
    });
    return {
      page,
      visitors: r?.results?.visitors?.value ?? 0,
      bounceRate: r?.results?.bounce_rate?.value ?? null,
    };
  }));
}

export type TrafficSummary = Awaited<ReturnType<typeof getTrafficSummary>>;

export async function getTrafficSummary() {
  const priorRange = `${ymd(daysAgo(13))},${ymd(daysAgo(7))}`; // the 7 days before the last 7

  // Traffic (Plausible) — run concurrently.
  const [v7, vPrior, v30, ai7, aiPrior, ai30, pagesRes] = await Promise.all([
    visitorsFor({ period: '7d' }),
    visitorsFor({ period: 'custom', date: priorRange }),
    visitorsFor({ period: '30d' }),
    aiVisitors({ period: '7d' }),
    aiVisitors({ period: 'custom', date: priorRange }),
    aiVisitors({ period: '30d' }),
    plausible('breakdown', { period: '30d', property: 'event:page', metrics: 'visitors,pageviews', limit: '100' }),
  ]);

  // Top guides — /useful-info/ articles (exclude the index), top 6 by visitors.
  const allPages: { page: string; visitors: number; pageviews: number }[] = pagesRes?.results ?? [];
  const topGuides = allPages
    .filter(p => p.page.startsWith('/useful-info/') && p.page !== '/useful-info/' && p.page !== '/useful-info')
    .slice(0, 6);

  // Conversions (our DB).
  const conv = (days: number) => ({
    valuations: countSince('valuation_requests', days),
    enquiries: countSince('enquiries', days),
    financeLeads: countSince('finance_leads', days),
  });
  const c30 = conv(30);
  const c7 = conv(7);

  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

  return {
    apiConfigured: Boolean(PLAUSIBLE_KEY),
    visitors: { last7: v7, prior7: vPrior, d30: v30 },
    ai: { last7: ai7.total, prior7: aiPrior.total, d30: ai30.total, sources: ai30.sources },
    conversions30: c30,
    conversions7: c7,
    rates30: {
      valuationPct: pct(c30.valuations, v30),
      enquiryPct: pct(c30.enquiries, v30),
      leadPct: pct(c30.financeLeads, v30),
    },
    topGuides,
    aiFirstParty: aiReferralsFirstParty(),
  };
}
