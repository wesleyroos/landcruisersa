import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async ({ url, cookies, redirect, request }, next) => {
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

  // Request timing — log slow renders and all admin page loads so
  // slowness reports can be split into server-side vs network/client.
  const start = Date.now();
  const response = await next();
  const ms = Date.now() - start;
  if (ms > 1000 || isAdminArea) {
    console.log(`[timing] ${request.method} ${path} -> ${response.status} in ${ms}ms`);
  }
  return response;
});
