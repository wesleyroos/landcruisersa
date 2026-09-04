import { reconcileBoosts } from './boost-reconcile';
import { sweepBoostFollowups } from './boost-followup';
import { boostEnabled } from './social-boost';

// In-process sweep for unconfirmed boost payments. Mirrors the alerts/IG
// schedulers: the site runs 24/7 on Fly, so we don't depend on GitHub Actions —
// and here we can't depend on Paystack's webhook either, because this Paystack
// business only allows one webhook URL and it belongs to the GD portal.
//
// Every 5 minutes is well inside the "seller is still on the page" window, and
// reconcileBoosts() only looks at boosts from the last few hours, so a quiet
// site costs nothing.

let started = false;

export function ensureBoostScheduler(): void {
  if (started) return;
  started = true;

  const tick = async () => {
    try {
      if (boostEnabled()) {
        const res = await reconcileBoosts();
        if (res.paid) console.log(`[boost] reconciled ${res.paid} payment(s) of ${res.checked} pending`);
      }
      // Runs even with the offer switched off: a seller who already asked is
      // still owed their submission receipt (and the pay link if they never
      // finished), and the page behind that link handles the paused case.
      const sent = await sweepBoostFollowups();
      if (sent) console.log(`[boost] sent ${sent} submission follow-up(s)`);
    } catch (e) {
      console.error('[boost] tick failed', e);
    }
  };

  setInterval(tick, 5 * 60 * 1000);
  setTimeout(tick, 45 * 1000);
}
