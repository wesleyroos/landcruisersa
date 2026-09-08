export const prerender = false;

import type { APIRoute } from 'astro';
import { requireAdmin, unauthorized } from '@/lib/admin-auth';
import {
  engageKeyPresent,
  isEngageSyncEnabled,
  setEngageSyncEnabled,
  syncContactsToEngage,
  personToEngageContact,
  trackEngageEvent,
} from '@/lib/integrations/engage';
import { buildMasterList } from '@/lib/people';

// The kill switch, and the one-time backfill.
//
// GET  → current state
// POST { enabled }  → flip the switch
// POST { backfill: true }  → push the whole master list

export const GET: APIRoute = async ({ cookies }) => {
  if (!requireAdmin(cookies)) return unauthorized();
  const { masterTotal, consentedTotal } = buildMasterList();
  return Response.json({
    keyPresent: engageKeyPresent(),
    enabled: isEngageSyncEnabled(),
    people: masterTotal,
    consented: consentedTotal,
  });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!requireAdmin(cookies)) return unauthorized();

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Body must be JSON' }, { status: 400 });
  }

  if (typeof body.enabled === 'boolean') {
    setEngageSyncEnabled(body.enabled);
    // Not gated on the toggle, so switching it off is itself visible in Engage.
    trackEngageEvent('lcsa_sync_toggled', { properties: { enabled: body.enabled } });
    return Response.json({ enabled: isEngageSyncEnabled() });
  }

  if (body.backfill === true) {
    if (!isEngageSyncEnabled()) {
      return Response.json({ error: 'Turn the sync on first.' }, { status: 409 });
    }
    const { master } = buildMasterList();
    // Engage takes 100 contacts per call and rate-limits at 300 calls a minute,
    // so the whole base is a handful of requests. Sent in series rather than
    // fired at once, because a burst of parallel writes on one tenant is how
    // you find the rate limit rather than the finish line.
    const contacts = master.map(personToEngageContact);
    let sent = 0;
    for (let i = 0; i < contacts.length; i += 100) {
      syncContactsToEngage(contacts.slice(i, i + 100));
      sent += Math.min(100, contacts.length - i);
      await new Promise((r) => setTimeout(r, 250));
    }
    trackEngageEvent('lcsa_backfill_run', { properties: { people: sent } });
    return Response.json({ queued: sent, batches: Math.ceil(contacts.length / 100) });
  }

  return Response.json({ error: 'Nothing to do' }, { status: 400 });
};
