import { runAlertSweep } from './alerts';

// Server-side daily trigger for saved-vehicle alerts. Mirrors the IG-suggestion
// scheduler: the site runs 24/7 on Fly, so we don't rely on GitHub's delayed
// Actions. Fires once during the 08:00 SAST hour (offset from the 07:00 IG
// email); runAlertSweep()'s per-day guard makes repeated ticks safe.

let started = false;

export function ensureAlertsScheduler(): void {
  if (started) return;
  started = true;

  const tick = async () => {
    try {
      const sastHour = new Date(Date.now() + 2 * 3600 * 1000).getUTCHours();
      if (sastHour !== 8) return;
      const res = await runAlertSweep();
      if (res.emailsSent) console.log(`[alerts] sent ${res.emailsSent} alert email(s) to ${res.usersNotified} user(s)`);
    } catch (e) {
      console.error('[alerts] scheduler tick failed', e);
    }
  };

  setInterval(tick, 10 * 60 * 1000);
  setTimeout(tick, 20 * 1000);
}
