import type { AstroCookies } from 'astro';

// True when the request comes from a logged-in admin session — own clicks and
// views must never pollute the funnel data we make decisions on.
export function isAdminSession(cookies: AstroCookies): boolean {
  const token = cookies.get('lcsa_admin')?.value;
  const secret = import.meta.env.ADMIN_SECRET ?? process.env.ADMIN_SECRET;
  return Boolean(token && secret && token === secret);
}
