import { db } from '@/db/index';
import { siteConfig } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { Person } from '@/lib/people';
import { personExternalId } from '@/lib/people';

// Land Cruiser SA → Engage.
//
// Two switches, matching the pattern MyFundi and the GD portal already use:
//
//   1. ENGAGE_API_KEY — is this wired up at all? A deploy-time fact.
//   2. site_config.engage_sync_enabled — is it on right now? Flippable from
//      the admin page without a deploy, which is the actual kill switch.
//
// ⚠️ This one fails CLOSED, unlike MyFundi's. MyFundi fails open because the
// sync is core to that product and a settings read must not stop platform
// writes. Here the sync only feeds a marketing list, so if we cannot tell
// whether it is switched on, not sending is the safe answer — a website should
// never start shipping people's details somewhere because a config read
// hiccupped.
//
// The key is scoped to contacts:write + events:write, so even if it leaked it
// could not send a campaign or spend the wallet.

const BASE_URL = process.env.ENGAGE_API_BASE_URL ?? 'https://engage.grodigital.co.za';
const TOGGLE_KEY = 'engage_sync_enabled';

export function engageKeyPresent(): boolean {
  return Boolean(process.env.ENGAGE_API_KEY);
}

export function isEngageSyncEnabled(): boolean {
  if (!engageKeyPresent()) return false;
  try {
    const row = db.select().from(siteConfig).where(eq(siteConfig.key, TOGGLE_KEY)).get();
    return row?.value === 'true';
  } catch {
    return false; // fail closed — see the note above
  }
}

export function setEngageSyncEnabled(on: boolean): void {
  const value = on ? 'true' : 'false';
  db.insert(siteConfig)
    .values({ key: TOGGLE_KEY, value, updated_at: new Date() })
    .onConflictDoUpdate({ target: siteConfig.key, set: { value, updated_at: new Date() } })
    .run();
}

async function engageFetch(path: string, body: unknown): Promise<Response> {
  const apiKey = process.env.ENGAGE_API_KEY;
  if (!apiKey) throw new Error('ENGAGE_API_KEY is not configured');
  return fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
}

// ─── Contacts ──────────────────────────────────────────────────────────────

export interface EngageContact {
  externalId: string;
  email?: string;
  phone?: string;
  name?: string;
  traits?: Record<string, unknown>;
  consent?: { popia?: boolean; marketing?: 'opt_in' | 'opt_out' };
}

/**
 * A person from the master list, in Engage's shape.
 *
 * Consent is only ever asserted when we actually have it. Engage refuses to
 * let an opt_in overturn an unsubscribe made on its side, so a sync repeating
 * stale state cannot resurrect somebody who left — but there is no reason to
 * send a claim we cannot back, so an unconsented person goes across with no
 * consent at all and simply sits there unmessageable.
 */
export function personToEngageContact(p: Person): EngageContact {
  return {
    externalId: personExternalId(p),
    ...(p.email ? { email: p.email } : {}),
    ...(p.phone ? { phone: p.phone } : {}),
    ...(p.name ? { name: p.name } : {}),
    traits: {
      lcsa_sources: Object.keys(p.sources).join(','),
      lcsa_record_count: Object.values(p.sources).reduce((a, b) => a + b, 0),
      lcsa_first_seen: new Date(p.first).toISOString(),
      lcsa_last_seen: p.last ? new Date(p.last).toISOString() : null,
      ...(p.consentSource ? { lcsa_consent_source: p.consentSource } : {}),
      ...(p.notes.length ? { lcsa_activity: p.notes.join(' · ') } : {}),
    },
    ...(p.consentAt ? { consent: { popia: true, marketing: 'opt_in' as const } } : {}),
  };
}

/** A single form submission, in Engage's shape. */
export function submissionToEngageContact(input: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  source: string;
  consent: boolean;
  traits?: Record<string, unknown>;
}): EngageContact | null {
  const email = String(input.email ?? '').trim().toLowerCase();
  const phone = String(input.phone ?? '').trim();
  if (!email && !phone) return null;
  // Same identity rule as the master list, so a form submission and the
  // backfill resolve to one contact rather than two.
  const externalId = email
    ? `lcsa:email:${email}`
    : `lcsa:phone:${phone.replace(/\D/g, '').slice(-9)}`;

  return {
    externalId,
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(input.name ? { name: String(input.name).trim() } : {}),
    traits: { lcsa_sources: input.source, lcsa_consent_source: input.source, ...(input.traits ?? {}) },
    ...(input.consent ? { consent: { popia: true, marketing: 'opt_in' as const } } : {}),
  };
}

/**
 * Push one or many contacts. Never throws.
 *
 * Called from form endpoints AFTER the row is written, so a slow or unhappy
 * Engage can never cost somebody their enquiry. Failures are logged rather
 * than retried — a person who submits a form is also in the master list, so
 * the next backfill picks up anybody a blip dropped.
 */
export function syncContactsToEngage(contacts: EngageContact | EngageContact[]): void {
  if (!isEngageSyncEnabled()) return;
  const batch = Array.isArray(contacts) ? contacts : [contacts];
  if (batch.length === 0) return;

  void engageFetch('/api/v1/contacts', batch.length === 1 ? batch[0] : batch)
    .then(async (res) => {
      if (!res.ok) {
        console.error('[engage] contact sync failed', res.status, (await res.text()).slice(0, 300));
      }
    })
    .catch((err) => console.error('[engage] contact sync failed', String(err)));
}

// ─── Events ────────────────────────────────────────────────────────────────

/**
 * Record something a person did.
 *
 * Deliberately NOT gated on the toggle, only on the key — the same choice
 * MyFundi made. Switching the sync off is itself worth seeing on the rails,
 * and an event carries no personal detail beyond the contact reference.
 */
export function trackEngageEvent(
  name: string,
  input: { email?: string | null; phone?: string | null; properties?: Record<string, unknown> } = {},
): void {
  if (!engageKeyPresent()) return;
  const email = String(input.email ?? '').trim().toLowerCase();
  const phone = String(input.phone ?? '').trim();

  void engageFetch('/api/v1/events', {
    name,
    ...(email || phone ? { contact: { ...(email ? { email } : {}), ...(phone ? { phone } : {}) } } : {}),
    properties: input.properties ?? {},
    occurredAt: new Date().toISOString(),
  })
    .then(async (res) => {
      if (!res.ok) {
        console.error('[engage] event failed', name, res.status, (await res.text()).slice(0, 200));
      }
    })
    .catch((err) => console.error('[engage] event failed', name, String(err)));
}
