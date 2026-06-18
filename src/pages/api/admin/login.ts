export const prerender = false;

import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const password = form.get('password') as string;

  const adminPassword = import.meta.env.ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD;
  const adminSecret   = import.meta.env.ADMIN_SECRET   ?? process.env.ADMIN_SECRET;
  if (password && password === adminPassword) {
    cookies.set('lcsa_admin', adminSecret ?? '', {
      path: '/',
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7,
    });
    // JS-readable flag (NOT the secret) so client-side third-party scripts
    // (e.g. Hotjar) can exclude admin sessions on prerendered pages too.
    cookies.set('lcsa_is_admin', '1', {
      path: '/',
      httpOnly: false,
      secure: import.meta.env.PROD,
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7,
    });
    return redirect('/admin');
  }

  return redirect('/admin/login?error=1');
};
