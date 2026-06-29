// Builds the "your saved vehicle changed" email. One email per user per run,
// bundling every price drop / sold-or-removed event across their favourites, so
// a user with three changes gets one email, not three.

const SITE = 'https://landcruisersa.co.za';
const SUPPORT_EMAIL = 'info@landcruisersa.co.za';

export interface FavEvent {
  type: 'drop' | 'sold';
  slug: string;
  title: string;
  photo: string | null;       // absolute URL or null
  fromPrice?: number;         // drop only
  toPrice?: number;           // drop only
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const fmt = (n: number) => 'R' + Math.round(n).toLocaleString('en-ZA');

export function buildFavoriteAlertEmail(opts: {
  firstName: string;
  events: FavEvent[];
  unsubUrl: string;
}): { subject: string; html: string } {
  const { firstName, events, unsubUrl } = opts;
  const drops = events.filter(e => e.type === 'drop');
  const solds = events.filter(e => e.type === 'sold');

  // Subject — lead with the single most relevant event, or summarise.
  let subject: string;
  if (events.length === 1) {
    const e = events[0];
    subject = e.type === 'drop'
      ? `Price drop: ${e.title} is now ${fmt(e.toPrice ?? 0)}`
      : `Sold: ${e.title} is no longer available`;
  } else {
    const bits = [];
    if (drops.length) bits.push(`${drops.length} price drop${drops.length > 1 ? 's' : ''}`);
    if (solds.length) bits.push(`${solds.length} sold`);
    subject = `${bits.join(' · ')} on your saved Land Cruisers`;
  }

  const dropCard = (e: FavEvent) => {
    const url = `${SITE}/listings/${e.slug}/`;
    const drop = (e.fromPrice ?? 0) - (e.toPrice ?? 0);
    return `
      <div style="margin-bottom:16px;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">
        ${e.photo ? `<a href="${url}"><img src="${e.photo}" alt="" style="display:block;width:100%;height:auto;" /></a>` : ''}
        <div style="padding:16px;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:1px;color:#166534;">▼ PRICE DROP</p>
          <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#111;">${esc(e.title)}</p>
          <p style="margin:0 0 12px;font-size:14px;color:#374151;">
            <span style="text-decoration:line-through;color:#9CA3AF;">${fmt(e.fromPrice ?? 0)}</span>
            &nbsp;→&nbsp; <strong style="color:#111;">${fmt(e.toPrice ?? 0)}</strong>
            <span style="color:#166534;font-weight:700;">(saved ${fmt(drop)})</span>
          </p>
          <a href="${url}" style="display:inline-block;background:#F5A623;color:#111;font-size:13px;font-weight:700;text-decoration:none;padding:9px 18px;border-radius:8px;">View listing →</a>
        </div>
      </div>`;
  };

  const soldCard = (e: FavEvent) => {
    const url = `${SITE}/listings/${e.slug}/`;
    return `
      <div style="margin-bottom:16px;border:1px solid #E5E7EB;border-radius:12px;padding:16px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:1px;color:#991B1B;">NO LONGER AVAILABLE</p>
        <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#111;">${esc(e.title)}</p>
        <p style="margin:0 0 12px;font-size:13px;color:#6B7280;">This vehicle has left the market — it may have sold or been withdrawn.</p>
        <a href="${SITE}/listings/" style="display:inline-block;background:#111;color:#fff;font-size:13px;font-weight:700;text-decoration:none;padding:9px 18px;border-radius:8px;">Browse similar →</a>
      </div>`;
  };

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#111;">
      <p style="font-size:15px;">Hi ${esc(firstName)},</p>
      <p style="font-size:15px;line-height:1.6;">Here's what changed on the ${events.length === 1 ? 'vehicle' : 'vehicles'} you saved on Land Cruiser SA:</p>
      ${drops.map(dropCard).join('')}
      ${solds.map(soldCard).join('')}
      <p style="font-size:13px;line-height:1.6;color:#6B7280;margin-top:20px;">Manage your saved vehicles anytime at <a href="${SITE}/account/" style="color:#D4881A;">your account</a>.</p>
      <hr style="border:none;border-top:1px solid #E5E7EB;margin:20px 0;" />
      <p style="font-size:11px;color:#9CA3AF;line-height:1.6;">You're receiving this because you asked Land Cruiser SA to alert you about saved vehicles. <a href="${unsubUrl}" style="color:#9CA3AF;text-decoration:underline;">Unsubscribe from alerts</a> · Questions? <a href="mailto:${SUPPORT_EMAIL}" style="color:#9CA3AF;">${SUPPORT_EMAIL}</a></p>
    </div>`;

  return { subject, html };
}
