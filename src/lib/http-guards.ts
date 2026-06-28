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

// Reject cross-site state changes. The session cookie is SameSite=Lax (so it
// isn't sent on a cross-site POST anyway); this is a cheap second layer. A
// missing Origin header (non-browser client / same-origin navigation) passes.
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}
