export const prerender = false;

import type { APIRoute } from 'astro';
import { validWebhookSignature, markBoostPaid, boostConfigured } from '@/lib/social-boost';
import { sendBoostReceipt, sendBoostAdminAlert } from '@/lib/boost-email';

// Paystack's server-to-server confirmation. This is the authoritative path: it
// arrives even if the seller closes the tab the instant they pay. Unsigned or
// mis-signed bodies are forgeries and get a flat 401.
//
// Paystack retries on any non-2xx, so anything we can't act on (an event type
// we don't care about, a reference we don't recognise) still returns 200 —
// otherwise they'd retry it for days.
export const POST: APIRoute = async ({ request }) => {
  if (!boostConfigured()) return new Response('not configured', { status: 503 });

  const raw = await request.text();
  if (!validWebhookSignature(raw, request.headers.get('x-paystack-signature'))) {
    return new Response('bad signature', { status: 401 });
  }

  let event: { event?: string; data?: { reference?: string; amount?: number; status?: string; metadata?: { listing_id?: number | string } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response('ok', { status: 200 });
  }

  if (event.event !== 'charge.success' || event.data?.status !== 'success') {
    return new Response('ok', { status: 200 });
  }

  const reference = String(event.data.reference ?? '');
  const amountCents = Number(event.data.amount ?? 0);
  const fallbackId = Number(event.data.metadata?.listing_id ?? 0) || undefined;
  if (!reference) return new Response('ok', { status: 200 });

  const listing = markBoostPaid(reference, amountCents, fallbackId);
  if (listing) {
    await Promise.allSettled([
      sendBoostReceipt(listing, amountCents),
      sendBoostAdminAlert(listing, amountCents),
    ]);
  }

  return new Response('ok', { status: 200 });
};
