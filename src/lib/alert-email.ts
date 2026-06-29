// Builds the "your saved vehicles & searches" email. One email per user per
// run, bundling every price drop / sold-or-removed event across their
// favourites AND every new listing that matches a saved search — so a user with
// several updates gets one email, not many.

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

export interface SearchMatchGroup {
  label: string;              // the saved-search label
  cars: Array<{ slug: string; title: string; price: number; photo: string | null }>;
  more: number;               // extra matches beyond the ones listed
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const fmt = (n: number) => 'R' + Math.round(n).toLocaleString('en-ZA');

export function buildAlertEmail(opts: {
  firstName: string;
  events: FavEvent[];
  searches: SearchMatchGroup[];
  unsubUrl: string;
}): { subject: string; html: string } {
  const { firstName, events, searches, unsubUrl } = opts;
  const drops = events.filter(e => e.type === 'drop');
  const solds = events.filter(e => e.type === 'sold');
  const newMatches = searches.reduce((n, g) => n + g.cars.length + g.more, 0);

  // ── Subject ──
  let subject: string;
  if (events.length === 1 && !searches.length) {
    const e = events[0];
    subject = e.type === 'drop'
      ? `Price drop: ${e.title} is now ${fmt(e.toPrice ?? 0)}`
      : `Sold: ${e.title} is no longer available`;
  } else {
    const segs: string[] = [];
    if (drops.length) segs.push(`${drops.length} price drop${drops.length > 1 ? 's' : ''}`);
    if (solds.length) segs.push(`${solds.length} sold`);
    if (newMatches) segs.push(`${newMatches} new match${newMatches > 1 ? 'es' : ''}`);
    subject = segs.length ? `${segs.join(' · ')} · Land Cruiser SA` : 'Updates from Land Cruiser SA';
  }

  // ── Cards ──
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

  const soldCard = (e: FavEvent) => `
      <div style="margin-bottom:16px;border:1px solid #E5E7EB;border-radius:12px;padding:16px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:1px;color:#991B1B;">NO LONGER AVAILABLE</p>
        <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#111;">${esc(e.title)}</p>
        <p style="margin:0 0 12px;font-size:13px;color:#6B7280;">This vehicle has left the market — it may have sold or been withdrawn.</p>
        <a href="${SITE}/listings/" style="display:inline-block;background:#111;color:#fff;font-size:13px;font-weight:700;text-decoration:none;padding:9px 18px;border-radius:8px;">Browse similar →</a>
      </div>`;

  const matchRow = (c: { slug: string; title: string; price: number; photo: string | null }) => {
    const url = `${SITE}/listings/${c.slug}/`;
    return `
      <a href="${url}" style="display:flex;gap:12px;align-items:center;text-decoration:none;color:#111;padding:10px 0;border-bottom:1px solid #F3F4F6;">
        ${c.photo ? `<img src="${c.photo}" alt="" style="width:72px;height:54px;object-fit:cover;border-radius:6px;flex-shrink:0;" />` : ''}
        <span style="flex:1;">
          <span style="display:block;font-size:14px;font-weight:700;">${esc(c.title)}</span>
          <span style="display:block;font-size:13px;color:#166534;font-weight:700;">${fmt(c.price)}</span>
        </span>
      </a>`;
  };

  const searchGroup = (g: SearchMatchGroup) => `
      <div style="margin-bottom:18px;border:1px solid #E5E7EB;border-radius:12px;padding:16px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:1px;color:#9CA3AF;">NEW MATCHES FOR YOUR SEARCH</p>
        <p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#111;">${esc(g.label)}</p>
        ${g.cars.map(matchRow).join('')}
        ${g.more > 0 ? `<p style="margin:12px 0 0;font-size:13px;"><a href="${SITE}/listings/" style="color:#D4881A;font-weight:700;">+ ${g.more} more — view all →</a></p>` : ''}
      </div>`;

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#111;">
      <p style="font-size:15px;">Hi ${esc(firstName)},</p>
      <p style="font-size:15px;line-height:1.6;">Here's what's new on your saved vehicles and searches:</p>
      ${drops.map(dropCard).join('')}
      ${solds.map(soldCard).join('')}
      ${searches.map(searchGroup).join('')}
      <p style="font-size:13px;line-height:1.6;color:#6B7280;margin-top:20px;">Manage your saved vehicles and searches anytime at <a href="${SITE}/account/" style="color:#D4881A;">your account</a>.</p>
      <hr style="border:none;border-top:1px solid #E5E7EB;margin:20px 0;" />
      <p style="font-size:11px;color:#9CA3AF;line-height:1.6;">You're receiving this because you asked Land Cruiser SA to alert you. <a href="${unsubUrl}" style="color:#9CA3AF;text-decoration:underline;">Unsubscribe from alerts</a> · Questions? <a href="mailto:${SUPPORT_EMAIL}" style="color:#9CA3AF;">${SUPPORT_EMAIL}</a></p>
    </div>`;

  return { subject, html };
}
