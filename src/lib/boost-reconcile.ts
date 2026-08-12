// Reconciliation sweep for paid social boosts.
//
// Paystack allows ONE webhook URL per business, and this account's is already
// pointed at the GD portal — so we cannot rely on the webhook reaching us. This
// sweep closes that gap by asking Paystack directly about every boost that is
// still sitting on 'requested': if the money actually landed, we mark it paid
// and send the receipt + alert exactly as the webhook would have.
//
// The browser's own verify-on-return call still handles the common case
// instantly. This is the safety net for anyone who paid and closed the tab.

import { db } from '@/db/index';
import { listings } from '@/db/schema';
import { and, eq, gte, isNotNull, sql } from 'drizzle-orm';
import { verifyTransaction, markBoostPaid, boostConfigured } from './social-boost';
import { sendBoostReceipt, sendBoostAdminAlert } from './boost-email';

// Payment happens within seconds of submitting, so a boost that is still unpaid
// after this long was almost certainly abandoned. Bounding the window stops us
// re-checking dead rows forever (an abandoned tick would otherwise cost a
// Paystack call every sweep, for as long as the row exists).
const WINDOW_HOURS = 6;
const MAX_PER_SWEEP = 20;

export interface ReconcileResult {
  checked: number;
  paid: number;
}

export async function reconcileBoosts(opts: { windowHours?: number } = {}): Promise<ReconcileResult> {
  if (!boostConfigured()) return { checked: 0, paid: 0 };

  const windowHours = opts.windowHours ?? WINDOW_HOURS;
  const since = new Date(Date.now() - windowHours * 3600 * 1000);

  const pending = db.select({ ref: listings.social_boost_ref })
    .from(listings)
    .where(and(
      eq(listings.social_boost, 'requested'),
      isNotNull(listings.social_boost_ref),
      gte(listings.created_at, since),
    ))
    .orderBy(sql`created_at desc`)
    .limit(MAX_PER_SWEEP)
    .all();

  let paid = 0;
  for (const row of pending) {
    const ref = row.ref;
    if (!ref) continue;
    const result = await verifyTransaction(ref);
    // null = we couldn't reach Paystack; leave it pending for the next sweep.
    if (!result?.success) continue;

    const listing = markBoostPaid(result.reference, result.amountCents);
    if (listing) {
      paid++;
      await Promise.allSettled([
        sendBoostReceipt(listing, result.amountCents),
        sendBoostAdminAlert(listing, result.amountCents),
      ]);
    }
  }

  return { checked: pending.length, paid };
}
