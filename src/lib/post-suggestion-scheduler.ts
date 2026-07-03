import { sendPostSuggestionEmail } from './post-suggestion-email';
import { syncIgInsightsDaily } from './ig-insights';

// Server-side morning trigger. The site runs 24/7 on Fly, so we don't depend on
// GitHub's (chronically delayed) scheduled Actions for the daily IG email.
// On the first request after boot this starts a timer that fires once during the
// 07:00 SAST hour; the once-a-day guard in sendPostSuggestionEmail() makes it
// safe to tick repeatedly and safe to run alongside the GitHub backup cron.

let started = false;

export function ensurePostSuggestionScheduler(): void {
  if (started) return;
  started = true;

  const tick = async () => {
    try {
      // SAST = UTC+2 (no DST). Only the 07:xx SAST window is eligible.
      const sastHour = new Date(Date.now() + 2 * 3600 * 1000).getUTCHours();
      if (sastHour !== 7) return;
      // Insights sync first so the morning email sees fresh outcome data. Own
      // once-a-day guard; a sync failure must not block the email.
      try { await syncIgInsightsDaily(); } catch (e) { console.error('[ig-insights] daily sync failed', e); }
      const res = await sendPostSuggestionEmail();
      if (res.emailed) console.log(`[ig-suggestion] sent morning email (${res.suggestions.length} picks)`);
    } catch (e) {
      console.error('[ig-suggestion] scheduler tick failed', e);
    }
  };

  // Check every 10 min (fires within 10 min of 07:00), plus one tick shortly
  // after boot in case the server (re)starts inside the morning window.
  setInterval(tick, 10 * 60 * 1000);
  setTimeout(tick, 15 * 1000);
}
