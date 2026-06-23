// Indicative valuation certificate — HTML template + PDF rendering (PDFShift) +
// optional email delivery (Resend). The certificate is an INDICATIVE,
// market-evidenced document — an indicative estimate, not a physical-inspection/accredited valuation —
// that framing is printed on the artifact (watermark + disclaimer box). See
// docs/valuation-certificate-spec.md.
import { randomBytes } from 'node:crypto';

const SITE = 'https://landcruisersa.co.za';
const SUPPORT_EMAIL = 'info@landcruisersa.co.za';

// Canonical disclaimer is re-exported via the valuation lib; we inline the cert-
// specific lines here so the PDF never depends on remote assets/strings.
export const CERT_DISCLAIMERS = [
  'Estimates from observed asking prices, not confirmed sale prices — and not a finance or insurance valuation.',
  'This is an indicative market estimate, not an accredited, finance, or insurance valuation.',
  'Prepared by Land Cruiser SA as an independent third party to your sale, from comparable market data — an indicative estimate, not a physical-inspection valuation. For a transaction between connected parties, ensure your valuer is independent of that specific transaction.',
  'Based on details declared by the requester; the vehicle was not physically inspected.',
];

export interface CertificateData {
  certId: string;
  issuedAt: Date;
  expiresAt: Date;
  // vehicle (declared)
  year: number;
  modelLabel: string;        // e.g. 'Fortuner D-4D'
  specLabel: string;         // e.g. '2.5 D-4D Raised Body' ('' if none chosen)
  mileage: number;
  condition: string;         // 'excellent' | 'good' | 'fair' | 'rough'
  province: string | null;
  // valuation
  sellLow: number;
  sellMid: number;
  sellHigh: number;
  askingCeiling: number;
  confidence: 'high' | 'medium' | 'low';
  // cohort / methodology
  cohortSize: number;
  cohortLabel: string;
  cohortMedian: number;
  cohortP25: number;
  cohortP75: number;
  verifyUrl: string;
}

// Unambiguous base32 (no 0/1/I/O) so a cert id is safe to read over the phone.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export function mintCertId(year = new Date().getFullYear()): string {
  const buf = randomBytes(6);
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHABET[buf[i] % ALPHABET.length];
  return `LCSA-${year}-${s}`;
}

const R = (n: number) => 'R' + Math.round(n).toLocaleString('en-ZA');
const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
const esc = (s: string) =>
  String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

const CONFIDENCE_LABEL: Record<string, string> = {
  high: 'High confidence', medium: 'Good estimate', low: 'Rough estimate',
};
const CONDITION_LABEL: Record<string, string> = {
  excellent: 'Showroom', good: 'Good', fair: 'Average', rough: 'Needs work',
};

// Self-contained A4 HTML — all CSS inline, no remote assets (PDFShift renders on
// its own servers, so external/root-relative URLs would race or break).
export function buildCertificateHtml(d: CertificateData): string {
  const vehicle = `${d.year} ${d.modelLabel}${d.specLabel ? ` — ${d.specLabel}` : ''}`;
  const disclaimers = CERT_DISCLAIMERS.map(t => `<li>${esc(t)}</li>`).join('');
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; }
  .page { position: relative; width: 210mm; min-height: 297mm; padding: 18mm 16mm; overflow: hidden; }
  .wm { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%) rotate(-32deg);
        font-size: 150px; font-weight: 800; letter-spacing: 8px; color: rgba(245,166,35,0.06);
        white-space: nowrap; z-index: 0; pointer-events: none; }
  .content { position: relative; z-index: 1; }
  .head { display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 3px solid #111; padding-bottom: 14px; }
  .brand { font-weight: 800; font-size: 20px; letter-spacing: 1px; text-transform: uppercase; }
  .brand small { display: block; font-size: 9px; letter-spacing: 3px; color: #6B7280; font-weight: 700; margin-top: 3px; }
  .title { text-align: right; }
  .title h1 { font-size: 19px; text-transform: uppercase; letter-spacing: 1px; color: #111; }
  .title .amber { color: #D4881A; }
  .meta { display: flex; gap: 26px; margin-top: 14px; font-size: 11px; color: #374151; }
  .meta b { display: block; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #9CA3AF; margin-bottom: 2px; }
  .sec { margin-top: 22px; }
  .sec-h { font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #9CA3AF; font-weight: 700; margin-bottom: 10px; }
  .vehicle { font-size: 22px; font-weight: 800; }
  .specs { display: flex; flex-wrap: wrap; gap: 22px; margin-top: 12px; font-size: 12px; }
  .specs div b { display: block; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #9CA3AF; margin-bottom: 2px; }
  .declared { font-size: 9px; color: #9CA3AF; margin-top: 8px; font-style: italic; }
  .hero { background: #111; border-radius: 12px; padding: 26px 24px; margin-top: 14px; color: #fff; text-align: center; }
  .hero .conf { display: inline-block; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;
                color: #FBBF24; border: 1px solid rgba(251,191,36,0.4); border-radius: 999px; padding: 4px 12px; margin-bottom: 12px; }
  .hero .lab { font-size: 11px; color: rgba(255,255,255,0.6); }
  .hero .big { font-family: "Helvetica Neue", Arial, sans-serif; font-weight: 800; font-size: 46px; color: #F5A623; line-height: 1.05; margin: 4px 0; }
  .hero .range { font-size: 13px; color: rgba(255,255,255,0.85); margin-top: 6px; }
  .hero .range b { color: #fff; }
  .hero .sell { font-size: 12px; color: rgba(255,255,255,0.6); margin-top: 8px; }
  .hero .sell b { color: #fff; }
  .method { background: #F8F7F5; border: 1px solid #E5E2DC; border-radius: 10px; padding: 16px 18px; margin-top: 14px; font-size: 11.5px; line-height: 1.6; color: #374151; }
  .method b { color: #111; }
  .disc { border: 1px solid #E5E2DC; border-radius: 10px; padding: 14px 18px; margin-top: 14px; }
  .disc h3 { font-size: 9px; text-transform: uppercase; letter-spacing: 2px; color: #9CA3AF; margin-bottom: 8px; }
  .disc ul { list-style: none; }
  .disc li { font-size: 10px; line-height: 1.55; color: #4B5563; padding-left: 14px; position: relative; margin-bottom: 4px; }
  .disc li:before { content: "•"; position: absolute; left: 2px; color: #D4881A; }
  .foot { border-top: 1px solid #E5E2DC; margin-top: 22px; padding-top: 12px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 10px; color: #6B7280; }
  .foot .verify b { color: #111; }
  .foot .cid { font-family: "SFMono-Regular", Menlo, Consolas, monospace; font-size: 11px; color: #111; font-weight: 700; }
</style></head>
<body><div class="page">
  <div class="wm">INDICATIVE</div>
  <div class="content">
    <div class="head">
      <div class="brand">Land Cruiser SA<small>LANDCRUISERSA.CO.ZA</small></div>
      <div class="title"><h1>Indicative<br><span class="amber">Market Valuation</span></h1></div>
    </div>

    <div class="meta">
      <div><b>Certificate No.</b>${esc(d.certId)}</div>
      <div><b>Issued</b>${fmtDate(d.issuedAt)}</div>
      <div><b>Valid until</b>${fmtDate(d.expiresAt)}</div>
    </div>

    <div class="sec">
      <div class="sec-h">Vehicle</div>
      <div class="vehicle">${esc(vehicle)}</div>
      <div class="specs">
        <div><b>Mileage</b>${d.mileage.toLocaleString('en-ZA')} km</div>
        <div><b>Condition</b>${esc(CONDITION_LABEL[d.condition] ?? d.condition)}</div>
        ${d.province ? `<div><b>Province</b>${esc(d.province)}</div>` : ''}
      </div>
      <div class="declared">All vehicle details above were declared by the requester and not independently verified.</div>
    </div>

    <div class="hero">
      <div class="conf">${esc(CONFIDENCE_LABEL[d.confidence] ?? 'Estimate')}</div>
      <div class="lab">Indicative market value (typical asking)</div>
      <div class="big">${R(d.askingCeiling)}</div>
      <div class="range">Realistic-sell range <b>${R(d.sellLow)} – ${R(d.sellHigh)}</b></div>
      <div class="sell">A vehicle like this typically sells for about <b>${R(d.sellMid)}</b></div>
    </div>

    <div class="method">
      <div class="sec-h" style="margin-bottom:8px">Methodology</div>
      Based on <b>${d.cohortSize}</b> comparable Land Cruiser SA listings (<b>${esc(d.cohortLabel)}</b>)
      observed up to ${fmtDate(d.issuedAt)}. Method: median comparable asking price
      (<b>${R(d.cohortMedian)}</b>), adjusted for mileage and condition, then discounted to a realistic
      private-sale figure using an industry trade proxy. Observed market spread (25th–75th percentile):
      <b>${R(d.cohortP25)} – ${R(d.cohortP75)}</b>.
    </div>

    <div class="disc">
      <h3>Important — please read</h3>
      <ul>${disclaimers}</ul>
    </div>

    <div class="foot">
      <div class="verify">Verify this certificate at<br><b>${esc(d.verifyUrl.replace(/^https?:\/\//, ''))}</b></div>
      <div class="cid">${esc(d.certId)}</div>
    </div>
  </div>
</div></body></html>`;
}

// Render HTML → PDF via PDFShift (v3). Throws on misconfig / API failure so the
// endpoint can return a clean 502 (never emit a blank/broken certificate).
export async function renderPdf(html: string): Promise<Buffer> {
  const KEY = import.meta.env.PDFSHIFT_API_KEY ?? process.env.PDFSHIFT_API_KEY ?? '';
  if (!KEY) throw new Error('PDFSHIFT_API_KEY not set');
  // Sandbox in dev (and when explicitly flagged) so local builds never bill credits.
  const sandbox = Boolean(import.meta.env.DEV) ||
    String(import.meta.env.PDFSHIFT_SANDBOX ?? process.env.PDFSHIFT_SANDBOX ?? '') === '1';

  const res = await fetch('https://api.pdfshift.io/v3/convert/pdf', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from('api:' + KEY).toString('base64'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ source: html, format: 'A4', margin: '0', use_print: true, sandbox }),
  });
  if (!res.ok) throw new Error(`PDFShift ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
}

// Optional "email me a copy" — Resend with the PDF attached. Best-effort: returns
// false on any failure (the caller must not fail the request over it).
export async function sendCertificateEmail(to: string, d: CertificateData, pdf: Buffer): Promise<boolean> {
  const RESEND_KEY = import.meta.env.RESEND_API_KEY ?? process.env.RESEND_API_KEY ?? '';
  if (!RESEND_KEY || !to.includes('@')) return false;
  const vehicle = `${d.year} ${d.modelLabel}${d.specLabel ? ` ${d.specLabel}` : ''}`;
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#111;">
      <p style="font-size:15px;">Hi there,</p>
      <p style="font-size:15px;line-height:1.6;">Here is your indicative market valuation certificate for your <strong>${esc(vehicle)}</strong> — attached as a PDF.</p>
      <div style="margin:18px 0;padding:16px;border:1px solid #E5E7EB;border-radius:12px;">
        <p style="margin:0 0 4px;font-size:13px;color:#6B7280;">Indicative market value (typical asking)</p>
        <p style="margin:0;font-size:26px;font-weight:800;color:#D4881A;">${R(d.askingCeiling)}</p>
        <p style="margin:8px 0 0;font-size:13px;color:#374151;">Realistic-sell range <strong>${R(d.sellLow)} – ${R(d.sellHigh)}</strong></p>
      </div>
      <p style="font-size:13px;line-height:1.6;">Certificate <strong>${esc(d.certId)}</strong> — valid until ${fmtDate(d.expiresAt)}. Verify it any time at <a href="${esc(d.verifyUrl)}" style="color:#D4881A;">${esc(d.verifyUrl.replace(/^https?:\/\//, ''))}</a>.</p>
      <p style="font-size:12px;line-height:1.6;color:#6B7280;">An indicative market estimate from comparable listings — independent of your sale, but not a physical-inspection, accredited, finance or insurance valuation. Based on details you declared; the vehicle was not inspected.</p>
      <p style="font-size:13px;margin-top:20px;">Thanks,<br/>The Land Cruiser SA team</p>
    </div>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Land Cruiser SA <noreply@landcruisersa.co.za>',
      to,
      reply_to: SUPPORT_EMAIL,
      subject: `Your ${vehicle} valuation certificate (${d.certId})`,
      html,
      attachments: [{ filename: `${d.certId}.pdf`, content: pdf.toString('base64') }],
    }),
  }).catch(() => null);
  return Boolean(res?.ok);
}
