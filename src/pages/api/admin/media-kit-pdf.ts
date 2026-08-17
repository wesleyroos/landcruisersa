export const prerender = false;

import type { APIRoute } from 'astro';
import { requireAdmin, unauthorized } from '@/lib/admin-auth';
import { renderPdf } from '@/lib/certificate';
import { publicOrigin } from '@/lib/http-guards';

// Proper HTML → PDF of the media kit via PDFShift (same renderer as the valuation
// certificate), rather than a browser print. It self-fetches the rendered,
// admin-gated media-kit page (forwarding the admin cookie), absolutises the
// relative asset URLs so PDFShift can load the stylesheet/logo/fonts, then
// converts with use_print:true so the sheet's @media print rules apply.
export const GET: APIRoute = async ({ cookies, url, request }) => {
  if (!requireAdmin(cookies)) return unauthorized();

  const forParam = (url.searchParams.get('for') ?? '').trim().slice(0, 60);
  const origin = publicOrigin(request);
  const secret = cookies.get('lcsa_admin')?.value ?? '';

  const qs = new URLSearchParams();
  if (forParam) qs.set('for', forParam);
  if (url.searchParams.get('ads') === '0') qs.set('ads', '0');
  const pageUrl = `${origin}/admin/media-kit${qs.toString() ? `?${qs}` : ''}`;
  let html: string;
  try {
    const res = await fetch(pageUrl, { headers: { Cookie: `lcsa_admin=${secret}` } });
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `media-kit page fetch ${res.status}` }), { status: 502 });
    }
    html = await res.text();
  } catch {
    return new Response(JSON.stringify({ error: 'media-kit page fetch failed' }), { status: 502 });
  }

  // Make the HTML fully self-contained so the PDF renders regardless of whether
  // PDFShift's servers can reach our origin (they can't in local dev). Inline the
  // built CSS bundle(s) and embed the logo as a data URI; Google Fonts stay as an
  // external link (public; the CSS has sans-serif fallbacks if they don't load).
  for (const m of html.matchAll(/<link[^>]+href="([^"]*\/_astro\/[^"]+\.css)"[^>]*>/g)) {
    try {
      const href = m[1];
      const cssUrl = href.startsWith('http') ? href : `${origin}${href}`;
      const cssRes = await fetch(cssUrl, { headers: { Cookie: `lcsa_admin=${secret}` } });
      if (cssRes.ok) html = html.replace(m[0], `<style>${await cssRes.text()}</style>`);
    } catch { /* skip */ }
  }
  try {
    const logoRes = await fetch(`${origin}/images/logo-dark.png`);
    if (logoRes.ok) {
      const b64 = Buffer.from(await logoRes.arrayBuffer()).toString('base64');
      html = html.replace(/src="[^"]*\/images\/logo-dark\.png"/g, `src="data:image/png;base64,${b64}"`);
    }
  } catch { /* skip — logo falls back to alt text */ }
  // Belt and braces: any remaining relative href/src → absolute.
  html = html.replace(/(href|src)="\/(?!\/)/g, `$1="${origin}/`);

  let pdf: Buffer;
  try {
    pdf = await renderPdf(html);
  } catch (e) {
    return new Response(JSON.stringify({ error: 'PDF render failed', detail: String(e).slice(0, 200) }), { status: 502 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const slug = forParam ? '-' + forParam.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() : '';
  return new Response(pdf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="lcsa-media-kit${slug}-${today}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
};
