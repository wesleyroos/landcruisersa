export const prerender = false;

import type { APIRoute } from 'astro';
import { getGscSummary } from '@/lib/gsc-summary';
import { pageBounceRates } from '@/lib/traffic-summary';

// Guide pages instrumented for Tier 3 conversion (CTA bounce-reduction) tracking.
const TRACKED_PAGES = [
  '/useful-info/land-cruiser-tyres-buyers-guide/',
  '/useful-info/land-cruiser-300-price-south-africa/',
  '/useful-info/best-rooftop-tent-for-a-land-cruiser/',
];

// Read-only GSC summary as JSON, guarded by a dedicated bearer token
// (GSC_REPORT_TOKEN). This exists so scheduled cloud agents — which have no GSC
// credential in their sandbox — can score the prediction ledger. Least-privilege
// on purpose: this token only reads search stats; it is NOT the ingest token
// (which can mutate listings) and NOT the Google service-account key.
export const GET: APIRoute = async ({ request }) => {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  const expected = process.env.GSC_REPORT_TOKEN ?? import.meta.env.GSC_REPORT_TOKEN;
  if (!expected || !token || token !== expected) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const [summary, bounce] = await Promise.all([
    getGscSummary(),
    pageBounceRates(TRACKED_PAGES).catch(() => null),
  ]);
  return new Response(JSON.stringify({ ...summary, bounce }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
