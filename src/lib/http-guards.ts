// Shared request guards for the auth/account surface. Centralised so the
// open-redirect and CSRF checks can't drift between the routes that use them.

// Resolve a user-supplied post-login redirect to a SAFE same-origin path, or
// fall back to /account/. Uses the WHATWG URL parser (not a string prefix
// check) so tricks like `/\evil.com`, `//evil.com`, `http://evil.com`, and
// `javascript:` all collapse to the fallback. A genuine relative path resolves
// to our dummy origin and is returned as pathname+search.
export function safeNextPath(next: string | null | undefined): string {
  const s = typeof next === 'string' ? next : '';
  if (s) {
    try {
      const u = new URL(s, 'http://x.invalid');
      if (u.origin === 'http://x.invalid' && u.pathname.startsWith('/') && !u.pathname.startsWith('//')) {
        return u.pathname + u.search;
      }
    } catch { /* fall through */ }
  }
  return '/account/';
}

// The public origin (scheme://host) the browser actually used, derived from the
// forwarded/Host headers — NOT request.url, which behind Fly's proxy is the
// internal host. Use this for any URL we hand back to a user (e.g. the magic
// link emailed at sign-in), or the link would point at an unreachable host.
export function publicOrigin(request: Request): string {
  const fwdHost = request.headers.get('x-forwarded-host');
  const host = (fwdHost ? fwdHost.split(',')[0].trim() : '') || request.headers.get('host') || '';
  if (host) {
    const proto = (request.headers.get('x-forwarded-proto') || '').split(',')[0].trim()
      || (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
    return `${proto}://${host}`;
  }
  try { return new URL(request.url).origin; } catch { return 'https://landcruisersa.co.za'; }
}

// Reject cross-site state changes. The session cookie is SameSite=Lax (so it
// isn't sent on a cross-site POST anyway); this is a cheap second layer. A
// missing Origin header (non-browser client / same-origin navigation) passes.
//
// Compare the browser's Origin to the forwarded/Host header — NOT request.url:
// behind Fly's proxy request.url carries the internal host, so comparing to it
// 403s legitimate same-origin requests. The Host/X-Forwarded-Host header is the
// public domain the browser actually used. Still CSRF-safe: a cross-site caller
// can't forge the Origin header, so its Origin won't match our Host.
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host;
    const fwd = request.headers.get('x-forwarded-host');
    const host = (fwd ? fwd.split(',')[0].trim() : '')
      || request.headers.get('host')
      || new URL(request.url).host;
    return originHost === host;
  } catch { return false; }
}
