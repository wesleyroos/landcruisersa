// "We've got your listing" — sent to the seller the moment they submit.
//
// Until now a private seller got nothing back from us at submit time: the only
// confirmation was the screen in front of them, and if they closed it (or paid
// for the boost and closed it) they had nothing in writing and no way back in.
// Two sellers in a row emailed to ask whether their listing had survived, and
// both had abandoned the boost payment on the way out.

const SITE = 'https://landcruisersa.co.za';
const SUPPORT_EMAIL = 'info@landcruisersa.co.za';

export interface SubmissionReceipt {
  to: string;
  sellerName: string;
  title: string;
  showOff: boolean;
  /** Set only when they asked for the boost and haven't paid — the resumable pay link. */
  boostPayUrl?: string | null;
  boostPriceRand?: number;
}

export async function sendSubmissionReceipt(r: SubmissionReceipt): Promise<boolean> {
  const key = String(import.meta.env.RESEND_API_KEY ?? process.env.RESEND_API_KEY ?? '');
  const to = r.to.trim();
  if (!key || !to.includes('@')) return false;

  const firstName = r.sellerName.trim().split(/\s+/)[0] || 'there';
  const boost = r.boostPayUrl
    ? `
      <div style="border:1px solid #F5A623;background:#FFFBF2;border-radius:10px;padding:16px;margin:24px 0;">
        <p style="font-size:15px;line-height:1.6;margin:0 0 12px;"><strong>One thing outstanding:</strong> you asked for the R${r.boostPriceRand} social media boost, but the payment didn't go through — so it isn't booked yet.</p>
        <p style="margin:0 0 12px;"><a href="${r.boostPayUrl}" style="display:inline-block;background:#F5A623;color:#111;font-size:14px;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:8px;">Pay R${r.boostPriceRand} and book the boost →</a></p>
        <p style="font-size:13px;line-height:1.55;color:#6B7280;margin:0;">This link stays valid — pay whenever suits you. Your listing is live either way, at no cost.</p>
      </div>`
    : '';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Land Cruiser SA <noreply@landcruisersa.co.za>',
      to,
      reply_to: SUPPORT_EMAIL,
      subject: `We've got your listing — ${r.title}`,
      html: `
        <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#111;">
          <p style="font-size:15px;">Hi ${firstName},</p>
          <p style="font-size:15px;line-height:1.6;">Your <strong>${r.title}</strong> is in — nothing more to do. It's in our review queue and we'll email you the moment it goes live, usually within 24 hours.</p>
          ${boost}
          <p style="font-size:15px;line-height:1.6;">A few things worth knowing:</p>
          <ul style="font-size:15px;line-height:1.7;color:#374151;">
            <li>Listing on Land Cruiser SA is <strong>free</strong>${r.showOff ? '' : ' — we take no commission on the sale'}.</li>
            <li>Buyers contact you directly on the number you gave us.</li>
            <li>Once it's live you get a private link to edit the price, swap photos, or mark it sold.</li>
          </ul>
          <p style="font-size:15px;line-height:1.6;">Just reply to this email if anything looks wrong.</p>
          <p style="font-size:14px;margin-top:24px;">Thanks,<br/>The Land Cruiser SA team<br/><a href="${SITE}" style="color:#6B7280;font-size:13px;">landcruisersa.co.za</a></p>
        </div>`,
    }),
  }).catch(() => null);

  return Boolean(res?.ok);
}
