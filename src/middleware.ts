import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async ({ url, cookies, redirect }, next) => {
  const path = url.pathname;
  const isAdminArea = path.startsWith('/admin');
  const isLoginPage = path === '/admin/login' || path === '/admin/login/';
  const isLoginApi = path === '/api/admin/login';

  if (isAdminArea && !isLoginPage && !isLoginApi) {
    const token = cookies.get('lcsa_admin')?.value;
    const secret = import.meta.env.ADMIN_SECRET ?? process.env.ADMIN_SECRET;

    if (!token || !secret || token !== secret) {
      return redirect('/admin/login');
    }
  }

  return next();
});
