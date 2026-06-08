export const prerender = false;

import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const password = form.get('password') as string;

  if (password && password === import.meta.env.ADMIN_PASSWORD) {
    cookies.set('lcsa_admin', import.meta.env.ADMIN_SECRET, {
      path: '/',
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7,
    });
    return redirect('/admin');
  }

  return redirect('/admin/login?error=1');
};
