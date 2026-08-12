export const prerender = false;

import type { APIRoute } from 'astro';
import { rateLimited, clientIp } from '@/lib/rate-limit';
import { verifyTransaction, markBoostPaid, boostConfigured } from '@/lib/social-boost';
import { sendBoostReceipt, sendBoostAdminAlert } from '@/lib/boost-email';

// Called by the browser the moment the Paystack popup reports success, so the
// seller sees a confirmed state immediately. We still ask Paystack directly —
// the client only tells us WHICH reference to check, never that it succeeded.
// The webhook is the backstop for anyone who closes the tab first.
export const POST: APIRoute = async ({ request }) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

  if (!boostConfigured()) return json({ error: 'Payments are not configured.' }, 503);
  if (rateLimited(`boost-verify:${clientIp(request)}`, 20, 60 * 60 * 1000)) {
    return json({ error: 'Too many attempts.' }, 429);
  }

  let ref = '';
  try {
    ref = String(((await request.json()) as { ref?: string }).ref ?? '').trim();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
  if (!ref) return json({ error: 'Missing payment reference.' }, 400);

  const result = await verifyTransaction(ref);
  if (!result) return json({ error: 'We could not confirm the payment. Please try again shortly.' }, 502);
  if (!result.success) return json({ paid: false });

  // Only the transition into 'paid' returns a listing — so the receipt and the
  // admin alert go out exactly once, whichever of verify/webhook lands first.
  const listing = markBoostPaid(result.reference, result.amountCents);
  if (listing) {
    await Promise.allSettled([
      sendBoostReceipt(listing, result.amountCents),
      sendBoostAdminAlert(listing, result.amountCents),
    ]);
  }

  return json({ paid: true });
};
