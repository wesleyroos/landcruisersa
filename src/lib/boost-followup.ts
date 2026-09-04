// Post-submit follow-up for listings that asked for the paid social boost.
//
// The submission receipt for these can't go out at submit time: the seller is
// usually still inside the Paystack popup, so we don't yet know whether to say
// "paid" or "you didn't finish". This sweep waits a few minutes, then sends the
// receipt — carrying the resumable pay link when the money never landed. That
// link is the only route back to the payment once the tab is closed, which is
// how the first two boost requests were both lost.

import { db } from '@/db/index';
import { listings } from '@/db/schema';
import { and, eq, gte, isNull, lte, ne, sql } from 'drizzle-orm';
import { boostPayUrl, boostPriceRand } from './social-boost';
import { sendSubmissionReceipt } from './submit-email';

// Long enough that a seller paying in the popup is already marked paid; short
// enough that someone who bailed still has the listing fresh in mind.
const DELAY_MINUTES = 15;
// Past this the row is stale — a follow-up would arrive out of the blue.
const MAX_AGE_DAYS = 7;
const MAX_PER_SWEEP = 20;

export async function sweepBoostFollowups(): Promise<number> {
  const now = Date.now();
  const due = new Date(now - DELAY_MINUTES * 60 * 1000);
  const floor = new Date(now - MAX_AGE_DAYS * 24 * 3600 * 1000);

  const rows = db.select().from(listings)
    .where(and(
      ne(listings.social_boost, 'none'),
      isNull(listings.social_boost_nudged_at),
      lte(listings.social_boost_asked_at, due),
      gte(listings.social_boost_asked_at, floor),
    ))
    .orderBy(sql`social_boost_asked_at asc`)
    .limit(MAX_PER_SWEEP)
    .all();

  let sent = 0;
  for (const listing of rows) {
    // Stamp first: a send that fails must not queue itself up forever, and a
    // seller must never get the same follow-up twice.
    db.update(listings).set({ social_boost_nudged_at: new Date() })
      .where(eq(listings.id, listing.id)).run();

    const unpaid = listing.social_boost !== 'paid';
    const ok = await sendSubmissionReceipt({
      to: listing.seller_email ?? '',
      sellerName: listing.seller_name ?? '',
      title: listing.title,
      showOff: listing.listing_type === 'show_off',
      boostPayUrl: unpaid ? boostPayUrl(listing) : null,
      boostPriceRand: boostPriceRand(),
    });
    if (ok) sent++;
  }

  return sent;
}
