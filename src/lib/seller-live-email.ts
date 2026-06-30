import type { Listing } from '@/db/schema';
import { firstPhotoOrNull } from './photos';

// "Your listing is now live" confirmation, sent to a private seller the moment
// an admin flips their submission to active. One-shot: the caller stamps
// seller_notified_at on success so edits/re-saves never re-trigger it.

const SITE = 'https://landcruisersa.co.za';
const SUPPORT_EMAIL = 'info@landcruisersa.co.za';

function firstPhoto(photos: string): string | null {
  const src = firstPhotoOrNull(photos);
  if (!src) return null;
  return src.startsWith('http') ? src : `${SITE}${src}`;
}

export async function sendSellerLiveEmail(listing: Listing): Promise<boolean> {
  const RESEND_KEY = import.meta.env.RESEND_API_KEY ?? process.env.RESEND_API_KEY ?? '';
  if (!RESEND_KEY) return false;

  const to = (listing.seller_email ?? '').trim();
  if (!to || !to.includes('@')) return false;

  const url = `${SITE}/listings/${listing.slug}/`;
  const firstName = (listing.seller_name ?? '').trim().split(/\s+/)[0] || 'there';
  const photo = firstPhoto(listing.photos);

  const fmt = (n: number) => 'R' + n.toLocaleString('en-ZA');
  const specBits = [
    listing.year,
    listing.model.replace(/-/g, ' ').toUpperCase(),
    listing.listing_type === 'for_sale' && listing.price ? fmt(listing.price) : null,
    listing.mileage ? `${listing.mileage.toLocaleString('en-ZA')} km` : null,
    listing.province,
  ].filter(Boolean).join(' · ');

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#111;">
      <p style="font-size:15px;">Hi ${firstName},</p>
      <p style="font-size:15px;line-height:1.6;">Good news — your Land Cruiser is now live on <strong>landcruisersa.co.za</strong> and visible to buyers across South Africa.</p>

      <div style="margin:20px 0;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">
        ${photo ? `<img src="${photo}" alt="" style="display:block;width:100%;height:auto;" />` : ''}
        <div style="padding:16px;">
          <p style="margin:0 0 6px;font-size:17px;font-weight:700;">${listing.title}</p>
          <p style="margin:0 0 14px;font-size:13px;color:#6B7280;">${specBits}</p>
          <a href="${url}" style="display:inline-block;background:#F5A623;color:#111;font-size:13px;font-weight:700;text-decoration:none;padding:10px 20px;border-radius:8px;">View your listing →</a>
        </div>
      </div>

      <p style="font-size:14px;line-height:1.6;">Please take a moment to check the photos and details are correct. <strong>Spot anything you'd like changed?</strong> Just reply to this email or contact us at <a href="mailto:${SUPPORT_EMAIL}" style="color:#D4881A;">${SUPPORT_EMAIL}</a> and we'll update it for you.</p>

      <p style="font-size:14px;line-height:1.6;">When the vehicle sells, let us know and we'll mark it sold.</p>

      <p style="font-size:14px;margin-top:24px;">Thanks,<br/>The Land Cruiser SA team</p>
      <p style="font-size:11px;color:#9CA3AF;margin-top:20px;">You're receiving this because your vehicle was submitted to landcruisersa.co.za. Questions? Email ${SUPPORT_EMAIL}.</p>
    </div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Land Cruiser SA <noreply@landcruisersa.co.za>',
      to,
      reply_to: SUPPORT_EMAIL,
      subject: `Your ${listing.year} ${listing.model.replace(/-/g, ' ')} is now live on Land Cruiser SA`,
      html,
    }),
  }).catch(() => null);

  return Boolean(res?.ok);
}
