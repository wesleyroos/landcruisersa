import { db } from '@/db/index';
import { siteConfig } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getPostSuggestions, type PostSuggestion } from './post-suggestions';

// Shared "email today's IG pick" logic, used by both the server-side scheduler
// (primary, fires ~07:00 SAST) and the GitHub cron route (deduped backup).
// A once-a-day guard in site_config means whichever fires first wins and the
// other no-ops — so the two triggers can't double-send.

const LAST_SENT_KEY = 'ig_suggestion_last_sent';

// SAST is UTC+2 year-round (no DST) — shift then read UTC fields.
function sastDateString(): string {
  return new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);
}

export interface SendResult {
  emailed: boolean;
  skipped?: string;
  suggestions: PostSuggestion[];
}

export async function sendPostSuggestionEmail({ force = false }: { force?: boolean } = {}): Promise<SendResult> {
  const today = sastDateString();

  if (!force) {
    const row = db.select().from(siteConfig).where(eq(siteConfig.key, LAST_SENT_KEY)).get();
    if (row?.value === today) return { emailed: false, skipped: 'already-sent-today', suggestions: [] };
  }

  const suggestions = getPostSuggestions(3);

  const RESEND_KEY = import.meta.env.RESEND_API_KEY ?? process.env.RESEND_API_KEY ?? '';
  const NOTIFY_EMAIL = import.meta.env.NOTIFY_EMAIL ?? process.env.NOTIFY_EMAIL ?? '';

  let emailed = false;
  if (suggestions.length > 0 && RESEND_KEY && NOTIFY_EMAIL) {
    const top = suggestions[0];
    const fmt = (n: number) => 'R' + n.toLocaleString('en-ZA');

    const itemHtml = (s: typeof top, rank: number) => `
      <div style="margin-bottom:20px;padding:16px;border:1px solid #E5E7EB;border-radius:10px;${rank === 1 ? 'border-color:#F5A623;background:#FFFBF0;' : ''}">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:1px;color:#9CA3AF;">${rank === 1 ? "⭐ TODAY'S PICK" : `RUNNER-UP ${rank - 1}`} — SCORE ${s.score}</p>
        <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#111;">${s.title}</p>
        <p style="margin:0 0 8px;font-size:13px;color:#6B7280;">${fmt(s.price)}${s.dropAmount > 0 ? ` <span style="color:#166534;font-weight:700;">(▼ ${fmt(s.dropAmount)} drop)</span>` : ''} · ${s.province} · ${s.photoCount} photos</p>
        <ul style="margin:0 0 12px;padding-left:18px;font-size:12px;color:#374151;">
          ${s.reasons.map(r => `<li>${r}</li>`).join('')}
        </ul>
        <a href="https://landcruisersa.co.za/admin/listings/${s.id}" style="display:inline-block;background:#111;color:#fff;font-size:12px;font-weight:700;text-decoration:none;padding:8px 16px;border-radius:6px;">Open &amp; Post →</a>
      </div>`;

    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;">
        <p style="font-size:13px;color:#6B7280;">Good morning — based on this week's demand, hooks and rotation, here's what to post to Instagram today:</p>
        ${suggestions.map((s, i) => itemHtml(s, i + 1)).join('')}
        <p style="font-size:11px;color:#9CA3AF;">Scoring: model demand × listing views × price-drop hook × photo quality × segment rotation. Data: landcruisersa.co.za/admin/insights</p>
      </div>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'noreply@landcruisersa.co.za',
        to: NOTIFY_EMAIL,
        subject: `[LCSA] Today's IG pick: ${top.title}${top.dropAmount > 0 ? ` (▼ R${top.dropAmount.toLocaleString('en-ZA')})` : ''}`,
        html,
      }),
    }).catch(() => null);
    emailed = Boolean(res?.ok);
  }

  // Only mark the day done once an email actually went out, so a failed send
  // lets the backup trigger retry later.
  if (emailed) {
    db.insert(siteConfig)
      .values({ key: LAST_SENT_KEY, value: today, updated_at: new Date() })
      .onConflictDoUpdate({ target: siteConfig.key, set: { value: today, updated_at: new Date() } })
      .run();
  }

  return { emailed, suggestions };
}
