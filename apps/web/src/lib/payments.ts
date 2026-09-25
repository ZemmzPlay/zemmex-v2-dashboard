import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { CURRENCIES, isCurrency } from '@zemmz/shared';

/**
 * Card payments. zemmz is the merchant: buyers pay zemmz's provider account on
 * a page hosted by the provider (card numbers never reach this server), and
 * organisers are paid out weekly from the ledger (see lib/payouts.ts).
 *
 *   PAYMENT_PROVIDER=stripe  Stripe Checkout (cards, Apple Pay, Google Pay)
 *   PAYMENT_PROVIDER=tap     Tap Payments (cards, Apple Pay, KNET, mada, Benefit)
 *   PAYMENT_PROVIDER=mock    a test page on this server with approve and decline
 *                            buttons; refused in production
 *
 * Every call is a plain fetch to the provider's REST API, so there is no SDK to
 * keep up to date. The provider is always asked for the final status: a return
 * URL or webhook only tells us to go and look.
 */
export type ProviderName = 'mock' | 'stripe' | 'tap';

export function paymentProvider(): ProviderName {
  const p = (process.env.PAYMENT_PROVIDER ?? 'mock').toLowerCase();
  return p === 'stripe' || p === 'tap' ? p : 'mock';
}

/** False when paid checkouts must be refused: production with no real provider. */
export function paymentsReady() {
  const p = paymentProvider();
  if (p === 'mock') return process.env.NODE_ENV !== 'production';
  if (p === 'stripe') return !!process.env.STRIPE_SECRET_KEY;
  return !!process.env.TAP_SECRET_KEY;
}

export const PROVIDER_LABEL: Record<ProviderName, string> = {
  mock: 'Test payments',
  stripe: 'Stripe',
  tap: 'Tap Payments',
};

export const PROVIDER_METHODS: Record<ProviderName, string> = {
  mock: 'Approve or decline a test payment',
  stripe: 'Visa, Mastercard, American Express, Apple Pay, Google Pay',
  tap: 'Visa, Mastercard, Apple Pay, KNET, mada, Benefit',
};

export class PaymentError extends Error {}

/**
 * What the provider charges zemmz to process a card payment, passed on at
 * cost: CARD_PROCESSING_BPS of the total (290 = 2.9%). Recorded on each order
 * when it's placed and deducted from the organiser's payout.
 */
export function cardProcessingMinor(totalMinor: number) {
  const bps = Number(process.env.CARD_PROCESSING_BPS ?? 0);
  return Number.isFinite(bps) && bps > 0 ? Math.round((totalMinor * bps) / 10_000) : 0;
}

const exponent = (currency: string) => (isCurrency(currency) ? CURRENCIES[currency].exponent : 2);
const toMajor = (minor: number, currency: string) => (minor / 10 ** exponent(currency)).toFixed(exponent(currency));

/* ------------------------------------------------------------------ */
/* Stripe                                                               */
/* ------------------------------------------------------------------ */

function form(obj: Record<string, string | number | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) p.append(k, String(v));
  return p;
}

async function stripe<T>(path: string, init: { method?: string; body?: URLSearchParams; idempotencyKey?: string } = {}): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(init.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(init.idempotencyKey ? { 'Idempotency-Key': init.idempotencyKey } : {}),
    },
    body: init.body,
    cache: 'no-store',
  });
  const json = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new PaymentError(json.error?.message ?? `Stripe returned ${res.status}`);
  return json;
}

/** Verifies the Stripe-Signature header (t=…,v1=…) against STRIPE_WEBHOOK_SECRET. */
export function verifyStripeSignature(body: string, header: string | null, secret = process.env.STRIPE_WEBHOOK_SECRET, now = Date.now()) {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(now / 1000 - t) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return header
    .split(',')
    .filter((p) => p.startsWith('v1='))
    .some((p) => {
      const a = Buffer.from(p.slice(3));
      const b = Buffer.from(expected);
      return a.length === b.length && timingSafeEqual(a, b);
    });
}

/* ------------------------------------------------------------------ */
/* Tap                                                                  */
/* ------------------------------------------------------------------ */

async function tap<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`https://api.tap.company/v2/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${process.env.TAP_SECRET_KEY}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const json = (await res.json()) as T & { errors?: { description?: string }[] };
  if (!res.ok) throw new PaymentError(json.errors?.[0]?.description ?? `Tap returned ${res.status}`);
  return json;
}

/* ------------------------------------------------------------------ */
/* What the rest of the app calls                                       */
/* ------------------------------------------------------------------ */

export interface CheckoutRequest {
  orderId: string;
  amountMinor: number;
  currency: string;
  description: string;
  buyer: { name: string; email: string };
  locale: string;
  /** Where the provider sends the buyer back to; `{SESSION}` is replaced where the provider supports it. */
  returnUrl: string;
  cancelUrl: string;
  webhookUrl: string;
  /** Our own test page, for the mock provider. */
  mockUrl: string;
}

/** Starts a hosted payment. Returns where to send the buyer, and the provider's id for it. */
export async function startCheckout(r: CheckoutRequest): Promise<{ url: string; session: string }> {
  const p = paymentProvider();
  if (!paymentsReady()) throw new PaymentError('Card payments are not set up for this event yet. Nothing was charged.');
  if (p === 'stripe') {
    const s = await stripe<{ id: string; url: string }>('checkout/sessions', {
      body: form({
        mode: 'payment',
        'line_items[0][quantity]': 1,
        'line_items[0][price_data][currency]': r.currency.toLowerCase(),
        'line_items[0][price_data][unit_amount]': r.amountMinor,
        'line_items[0][price_data][product_data][name]': r.description,
        customer_email: r.buyer.email,
        client_reference_id: r.orderId,
        'metadata[orderId]': r.orderId,
        'payment_intent_data[metadata][orderId]': r.orderId,
        locale: r.locale === 'ar' ? 'auto' : 'en-GB',
        // Seats are held for 45 minutes; Stripe's minimum session is 30.
        expires_at: Math.floor(Date.now() / 1000) + 35 * 60,
        success_url: r.returnUrl.replace('{SESSION}', '{CHECKOUT_SESSION_ID}'),
        cancel_url: r.cancelUrl,
      }),
      idempotencyKey: `checkout-${r.orderId}`,
    });
    return { url: s.url, session: s.id };
  }
  if (p === 'tap') {
    const [first, ...rest] = r.buyer.name.split(' ');
    const c = await tap<{ id: string; transaction?: { url?: string } }>('charges', {
      amount: Number(toMajor(r.amountMinor, r.currency)),
      currency: r.currency,
      customer_initiated: true,
      threeDSecure: true,
      save_card: false,
      description: r.description,
      reference: { order: r.orderId, transaction: r.orderId },
      metadata: { orderId: r.orderId },
      customer: { first_name: first || r.buyer.name, last_name: rest.join(' '), email: r.buyer.email },
      source: { id: 'src_all' },
      post: { url: r.webhookUrl },
      redirect: { url: r.returnUrl.replace('{SESSION}', '') },
    });
    if (!c.transaction?.url) throw new PaymentError('Tap did not return a payment page. Nothing was charged. Try again.');
    return { url: c.transaction.url, session: c.id };
  }
  return { url: r.mockUrl, session: `mock_${r.orderId}` };
}

export type PaymentStatus = { status: 'paid'; ref: string } | { status: 'failed'; message: string } | { status: 'pending' };

/** Asks the provider whether a checkout was paid. */
export async function checkPayment(provider: string, session: string): Promise<PaymentStatus> {
  if (provider === 'stripe') {
    const s = await stripe<{ status: string; payment_status: string; payment_intent: string | null }>(`checkout/sessions/${encodeURIComponent(session)}`);
    if (s.payment_status === 'paid' || s.payment_status === 'no_payment_required') return { status: 'paid', ref: s.payment_intent ?? session };
    if (s.status === 'expired') return { status: 'failed', message: 'The payment page expired before the payment was made.' };
    return { status: 'pending' };
  }
  if (provider === 'tap') {
    const c = await tap<{ id: string; status: string; response?: { message?: string } }>(`charges/${encodeURIComponent(session)}`);
    if (c.status === 'CAPTURED' || c.status === 'AUTHORIZED') return { status: 'paid', ref: c.id };
    if (['INITIATED', 'IN_PROGRESS'].includes(c.status)) return { status: 'pending' };
    return { status: 'failed', message: c.response?.message || 'The payment was not completed.' };
  }
  return { status: 'pending' };
}

/** Refunds part or all of a payment. The key makes retries safe. */
export async function refundPayment(opts: { provider: string; ref: string; amountMinor: number; currency: string; key: string; reason: string }): Promise<string> {
  if (opts.provider === 'stripe') {
    const r = await stripe<{ id: string; status: string; failure_reason?: string }>('refunds', {
      body: form({ payment_intent: opts.ref, amount: opts.amountMinor, reason: 'requested_by_customer', 'metadata[note]': opts.reason.slice(0, 400) }),
      idempotencyKey: opts.key,
    });
    if (r.status === 'failed' || r.status === 'canceled') throw new PaymentError(`Stripe refused the refund${r.failure_reason ? `: ${r.failure_reason}` : ''}.`);
    return r.id;
  }
  if (opts.provider === 'tap') {
    const r = await tap<{ id: string; status: string }>('refunds', {
      charge_id: opts.ref,
      amount: Number(toMajor(opts.amountMinor, opts.currency)),
      currency: opts.currency,
      reason: opts.reason.slice(0, 200) || 'requested_by_customer',
      reference: { merchant: opts.key },
      metadata: { key: opts.key },
    });
    if (r.status === 'FAILED' || r.status === 'CANCELLED') throw new PaymentError('Tap refused the refund.');
    return r.id;
  }
  // mock, seed and free orders: nothing to call
  if (process.env.NODE_ENV === 'production' && opts.provider === 'mock') throw new PaymentError('Test payments can’t be refunded in production.');
  return `refund_${opts.key.slice(-8)}`;
}
