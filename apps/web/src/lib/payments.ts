import 'server-only';
import { randomUUID } from 'node:crypto';

/**
 * Stand-in payment provider for local development. No card details are
 * collected: the checkout asks whether to approve or decline the test
 * payment. A real regional provider (not yet chosen — see the handover's
 * open questions) replaces this with hosted card fields and a server-side
 * capture, so card numbers never touch this server.
 */
export async function chargeMock(opts: { amountMinor: number; currency: string; outcome: string }): Promise<{ ok: true; ref: string } | { ok: false; message: string }> {
  if (process.env.NODE_ENV === 'production' && (process.env.PAYMENT_PROVIDER ?? 'mock') === 'mock') {
    return { ok: false, message: 'Payments are not set up for this event yet. Nothing was charged.' };
  }
  await new Promise((r) => setTimeout(r, 300));
  if (opts.outcome === 'decline') {
    return { ok: false, message: 'Your bank declined the payment. Nothing was charged. Try another card or payment method.' };
  }
  return { ok: true, ref: `mock_${randomUUID().slice(0, 8)}` };
}
