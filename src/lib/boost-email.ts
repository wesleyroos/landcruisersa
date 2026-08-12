// Emails for the paid social boost: a receipt to the seller (we took their
// money, so they get written confirmation of exactly what they bought) and an
// alert to us (this one is owed a post).

import type { Listing } from '@/db/schema';

const SITE = 'https://landcruisersa.co.za';
const SUPPORT_EMAIL = 'info@landcruisersa.co.za';

function resendKey(): string {
  return String(import.meta.env.RESEND_API_KEY ?? process.env.RESEND_API_KEY ?? '');
}

async function send(payload: Record<string, unknown>): Promise<boolean> {
  const key = resendKey();
  if (!key) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => null);
  return Boolean(res?.ok);
}

const rand = (cents: number) => `R${(cents / 100).toLocaleString('en-ZA')}`;

// Receipt to the seller.
export async function sendBoostReceipt(listing: Listing, amountCents: number): Promise<boolean> {
  const to = (listing.seller_email ?? '').trim();
  if (!to || !to.includes('@')) return false;
  const firstName = (listing.seller_name ?? '').trim().split(/\s+/)[0] || 'there';

  return send({
    from: 'Land Cruiser SA <noreply@landcruisersa.co.za>',
    to,
    reply_to: SUPPORT_EMAIL,
    subject: `Payment received — social media boost for your ${listing.title}`,
    html: `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#111;">
        <p style="font-size:15px;">Hi ${firstName},</p>
        <p style="font-size:15px;line-height:1.6;">Thanks — we've received your <strong>${rand(amountCents)}</strong> payment for a social media boost on your <strong>${listing.title}</strong>.</p>
        <p style="font-size:15px;line-height:1.6;">Here's what happens next:</p>
        <ul style="font-size:15px;line-height:1.7;color:#374151;">
          <li>We review and publish your listing (usually within 24 hours).</li>
          <li>We then post your Cruiser to the Land Cruiser SA <strong>Instagram and Facebook</strong> pages within 3 working days.</li>
          <li>Your listing keeps sending buyers straight to you — we don't take a commission on the sale.</li>
        </ul>
        <p style="font-size:15px;line-height:1.6;">If for any reason we can't post your vehicle, we'll refund you in full.</p>
        <p style="font-size:14px;margin-top:24px;">Thanks,<br/>The Land Cruiser SA team</p>
        <p style="font-size:12px;color:#9CA3AF;">Reference: ${listing.social_boost_ref ?? '—'}</p>
      </div>`,
  });
}

// Alert to us — this is the one that says "go post this".
export async function sendBoostAdminAlert(listing: Listing, amountCents: number): Promise<boolean> {
  const notify = String(import.meta.env.NOTIFY_EMAIL ?? process.env.NOTIFY_EMAIL ?? '');
  const to = [notify, 'wesley@grodigital.co.za'].filter(Boolean);
  if (to.length === 0) return false;

  return send({
    from: 'noreply@landcruisersa.co.za',
    to,
    subject: `💰 PAID social boost (${rand(amountCents)}) — ${listing.title}`,
    html: `
      <p style="font-size:16px;"><strong>💰 ${rand(amountCents)} received — this listing is owed a social post.</strong></p>
      <p>${listing.title}<br/>${listing.year} · ${listing.province ?? '—'}${listing.price ? ` · R${listing.price.toLocaleString('en-ZA')}` : ''}</p>
      <p>Seller: ${listing.seller_name} — ${listing.seller_email} — ${listing.seller_phone}</p>
      <p>Post it to <strong>Instagram + Facebook</strong> within 3 working days, then mark the boost as posted in admin.</p>
      <p><a href="${SITE}/admin/listings/${listing.id}">Open in Admin →</a></p>
      <p style="font-size:12px;color:#6B7280;">Paystack ref: ${listing.social_boost_ref ?? '—'}</p>`,
  });
}
