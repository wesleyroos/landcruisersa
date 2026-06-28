// Passwordless sign-in email. Sends a one-time magic link the user clicks to log
// in / finish creating their profile. Mirrors the Resend envelope used across the
// site (see seller-live-email.ts). The caller builds the absolute link from the
// request origin so it works in dev and prod alike.

const SUPPORT_EMAIL = 'info@landcruisersa.co.za';

// Escape user-controlled text before interpolating into the email HTML — a
// display name must never inject markup into our DKIM-signed mail.
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export async function sendMagicLinkEmail(to: string, link: string, name?: string | null): Promise<boolean> {
  const RESEND_KEY = import.meta.env.RESEND_API_KEY ?? process.env.RESEND_API_KEY ?? '';
  if (!RESEND_KEY) return false;

  const addr = (to ?? '').trim();
  if (!addr || !addr.includes('@')) return false;

  const firstName = esc((name ?? '').trim().split(/\s+/)[0]) || 'there';

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#111;">
      <p style="font-size:15px;">Hi ${firstName},</p>
      <p style="font-size:15px;line-height:1.6;">Click the button below to sign in to <strong>Land Cruiser SA</strong> and manage your saved vehicles and price alerts. This link is valid for 30 minutes and can only be used once.</p>

      <div style="margin:24px 0;">
        <a href="${link}" style="display:inline-block;background:#F5A623;color:#111;font-size:14px;font-weight:700;text-decoration:none;padding:12px 26px;border-radius:8px;">Sign in to Land Cruiser SA →</a>
      </div>

      <p style="font-size:13px;line-height:1.6;color:#6B7280;">If the button doesn't work, copy and paste this link into your browser:<br/>
        <a href="${link}" style="color:#D4881A;word-break:break-all;">${link}</a></p>

      <p style="font-size:13px;line-height:1.6;color:#6B7280;">If you didn't request this, you can safely ignore this email — no account changes will be made.</p>

      <p style="font-size:14px;margin-top:24px;">Thanks,<br/>The Land Cruiser SA team</p>
      <p style="font-size:11px;color:#9CA3AF;margin-top:20px;">Questions? Email <a href="mailto:${SUPPORT_EMAIL}" style="color:#9CA3AF;">${SUPPORT_EMAIL}</a>.</p>
    </div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Land Cruiser SA <noreply@landcruisersa.co.za>',
      to: addr,
      reply_to: SUPPORT_EMAIL,
      subject: 'Your Land Cruiser SA sign-in link',
      html,
    }),
  }).catch(() => null);

  return Boolean(res?.ok);
}
