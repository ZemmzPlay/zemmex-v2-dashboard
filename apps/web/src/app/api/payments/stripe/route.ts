import { NextResponse } from 'next/server';
import { prisma } from '@zemmz/db';
import { verifyStripeSignature } from '@/lib/payments';
import { syncOrder } from '@/lib/orders';
import { syncPurchase } from '@/lib/billing';
import { syncEntryOrder } from '@/lib/play/entry-payments';

/**
 * Stripe webhook: checkout.session.completed, .async_payment_succeeded,
 * .async_payment_failed and .expired. Point the endpoint at
 * https://<host>/api/payments/stripe and put its signing secret in
 * STRIPE_WEBHOOK_SECRET.
 */
export async function POST(req: Request) {
  const body = await req.text();
  if (!verifyStripeSignature(body, req.headers.get('stripe-signature'))) return NextResponse.json({ error: 'bad signature' }, { status: 400 });
  const event = JSON.parse(body) as { type: string; data: { object: { id: string; metadata?: { orderId?: string } } } };
  if (!event.type.startsWith('checkout.session.')) return NextResponse.json({ ok: true });
  const session = event.data.object;
  const order = await prisma.order.findFirst({ where: { OR: [{ providerSession: session.id }, { id: session.metadata?.orderId ?? '-' }], provider: 'stripe' } });
  if (order) {
    await syncOrder({ ...order, providerSession: order.providerSession ?? session.id });
    return NextResponse.json({ ok: true });
  }
  const plan = await prisma.planPurchase.findFirst({ where: { OR: [{ providerSession: session.id }, { id: session.metadata?.orderId ?? '-' }], provider: 'stripe' } });
  if (!plan) {
    const entry = await prisma.entryOrder.findFirst({ where: { OR: [{ providerSession: session.id }, { id: session.metadata?.orderId ?? '-' }], provider: 'stripe' } });
    if (!entry) return NextResponse.json({ ok: true, note: 'unknown order' });
    await syncEntryOrder({ ...entry, providerSession: entry.providerSession ?? session.id });
    return NextResponse.json({ ok: true });
  }
  await syncPurchase({ ...plan, providerSession: plan.providerSession ?? session.id });
  return NextResponse.json({ ok: true });
}
