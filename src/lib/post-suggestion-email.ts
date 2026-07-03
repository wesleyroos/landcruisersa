import { db } from '@/db/index';
import { igSuggestionLog } from '@/db/schema';
import { sql } from 'drizzle-orm';
import { getIgSuggestions, type PostSuggestion, type SlotPlan } from './post-suggestions';

// Shared "email today's IG pick" logic, used by both the server-side scheduler
// (primary, fires ~07:00 SAST) and the GitHub cron route (deduped backup).
// A once-a-day guard in site_config means whichever fires first wins and the
// other no-ops — so the two triggers can't double-send.

const LAST_SENT_KEY = 'ig_suggestion_last_sent';

// SAST is UTC+2 year-round (no DST) — shift then read UTC fields.
function sastDateString(): string {
  return new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);
}
const nowSec = () => Math.floor(Date.now() / 1000);

// Atomically claim today as "sent" in a SINGLE conditional write — the upsert
// only changes a row when today isn't already stored, so changes>0 means THIS
// caller won the day. We claim BEFORE sending (and release on failure): the old
// "send then mark" left a read→send→write gap, so any tick whose mark didn't
// land (write contention, a restart mid-send, two overlapping ticks) re-sent —
// which is exactly how one morning produced six identical emails.
function claimToday(today: string): boolean {
  const r = db.run(sql`
    INSERT INTO site_config (key, value, updated_at)
    VALUES (${LAST_SENT_KEY}, ${today}, ${nowSec()})
    ON CONFLICT(key) DO UPDATE SET value = ${today}, updated_at = ${nowSec()}
      WHERE site_config.value <> ${today}
  `);
  return Number(r.changes) > 0;
}
function markToday(today: string): void {
  db.run(sql`
    INSERT INTO site_config (key, value, updated_at)
    VALUES (${LAST_SENT_KEY}, ${today}, ${nowSec()})
    ON CONFLICT(key) DO UPDATE SET value = ${today}, updated_at = ${nowSec()}
  `);
}
function releaseToday(today: string): void {
  db.run(sql`UPDATE site_config SET value = '' WHERE key = ${LAST_SENT_KEY} AND value = ${today}`);
}

// One suggestion-log row per day — the engine's KPI is acceptance ("did Wesley
// post the #1 suggestion?"), so the daily #1 must be on record to compare
// against ig_posts. Idempotent per date.
function logSuggestion(today: string, plan: SlotPlan, top?: PostSuggestion): void {
  const existing = db.get<{ n: number }>(sql`SELECT count(*) n FROM ig_suggestion_log WHERE date = ${today}`)?.n ?? 0;
  if (existing > 0) return;
  db.insert(igSuggestionLog).values({
    date: today,
    slot: plan.slot,
    listing_id: plan.slot === 'cta' ? null : top?.id ?? null,
    score: plan.slot === 'cta' ? null : top?.score ?? null,
    created_at: new Date(),
  }).run();
  if (plan.slot === 'cta') {
    db.run(sql`
      INSERT INTO site_config (key, value, updated_at) VALUES ('ig_last_cta_suggested', ${today}, ${nowSec()})
      ON CONFLICT(key) DO UPDATE SET value = ${today}, updated_at = ${nowSec()}
    `);
  }
}

const SLOT_LABEL: Record<string, string> = {
  hero: '🔥 HERO BUILD',
  deal: '💰 DEAL',
  drop: '▼ PRICE DROP',
  cta:  '📢 SELLER CTA',
};

const CTA_TEMPLATE = `Today's slot is the audience CTA — post the seller-acquisition template instead of a listing:

"Selling your Land Cruiser? List it free on landcruisersa.co.za and we'll put it in front of 18,800+ Land Cruiser people."

(Backup hero picks below if you'd rather post a build today.)`;

export interface SendResult {
  emailed: boolean;
  skipped?: string;
  suggestions: PostSuggestion[];
}

export async function sendPostSuggestionEmail({ force = false }: { force?: boolean } = {}): Promise<SendResult> {
  const today = sastDateString();

  // Claim the day up front so concurrent / duplicate ticks no-op (force bypasses).
  if (!force && !claimToday(today)) {
    return { emailed: false, skipped: 'already-sent-today', suggestions: [] };
  }

  const { plan, suggestions } = getIgSuggestions(3);
  logSuggestion(today, plan, suggestions[0]);

  const RESEND_KEY = import.meta.env.RESEND_API_KEY ?? process.env.RESEND_API_KEY ?? '';
  const NOTIFY_EMAIL = import.meta.env.NOTIFY_EMAIL ?? process.env.NOTIFY_EMAIL ?? '';

  let emailed = false;
  if (suggestions.length > 0 && RESEND_KEY && NOTIFY_EMAIL) {
    const top = suggestions[0];
    const fmt = (n: number) => 'R' + n.toLocaleString('en-ZA');
    const slotLabel = SLOT_LABEL[plan.slot] ?? plan.slot.toUpperCase();

    const itemHtml = (s: typeof top, rank: number) => `
      <div style="margin-bottom:20px;padding:16px;border:1px solid #E5E7EB;border-radius:10px;${rank === 1 ? 'border-color:#F5A623;background:#FFFBF0;' : ''}">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:1px;color:#9CA3AF;">${rank === 1 ? `⭐ TODAY'S PICK — ${SLOT_LABEL[s.slot] ?? s.slot.toUpperCase()}` : `RUNNER-UP ${rank - 1}`} — SCORE ${s.score}</p>
        <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#111;">${s.title}</p>
        <p style="margin:0 0 8px;font-size:13px;color:#6B7280;">${fmt(s.price)}${s.dropAmount > 0 ? ` <span style="color:#166534;font-weight:700;">(▼ ${fmt(s.dropAmount)} drop)</span>` : ''} · ${s.province} · ${s.photoCount} photos${s.modsDetected.length ? ` · 🔧 ${s.modsDetected.slice(0, 3).join(', ')}` : ''}</p>
        <ul style="margin:0 0 12px;padding-left:18px;font-size:12px;color:#374151;">
          ${s.reasons.map(r => `<li>${r}</li>`).join('')}
        </ul>
        <a href="https://landcruisersa.co.za/admin/listings/${s.id}" style="display:inline-block;background:#111;color:#fff;font-size:12px;font-weight:700;text-decoration:none;padding:8px 16px;border-radius:6px;">Open &amp; Post →</a>
        <p style="margin:10px 0 0;font-size:11px;color:#9CA3AF;">Story link badge: <span style="color:#374151;">https://landcruisersa.co.za/listings/${s.slug}/?utm_source=ig-story</span></p>
      </div>`;

    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;">
        <p style="font-size:13px;color:#6B7280;">Good morning — today's slot: <strong>${slotLabel}</strong> (${plan.reason}).</p>
        ${plan.slot === 'cta' ? `<div style="margin-bottom:20px;padding:16px;border:1px solid #F5A623;border-radius:10px;background:#FFFBF0;font-size:13px;color:#374151;white-space:pre-line;">${CTA_TEMPLATE}</div>` : ''}
        ${suggestions.map((s, i) => itemHtml(s, i + 1)).join('')}
        <p style="font-size:11px;color:#9CA3AF;">Hero Engine: build mods × kitted-build premium × family prior × mint condition × rotation. Spec: docs/ig-engine-v2-spec.md · Data: landcruisersa.co.za/admin/insights</p>
      </div>`;

    const subject = plan.slot === 'cta'
      ? `[LCSA] IG today: 📢 Seller CTA day`
      : `[LCSA] IG ${slotLabel}: ${top.title}${top.dropAmount > 0 ? ` (▼ R${top.dropAmount.toLocaleString('en-ZA')})` : ''}`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'noreply@landcruisersa.co.za',
        to: NOTIFY_EMAIL,
        subject,
        html,
      }),
    }).catch(() => null);
    emailed = Boolean(res?.ok);
  }

  // The day was claimed before sending. If nothing actually went out, release the
  // claim so the backup trigger can retry later; a forced send still stamps it so
  // the scheduler then no-ops.
  if (!emailed && !force) releaseToday(today);
  else if (force && emailed) markToday(today);

  return { emailed, suggestions };
}
