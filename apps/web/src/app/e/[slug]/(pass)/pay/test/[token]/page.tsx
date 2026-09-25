import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@zemmz/db';
import { formatMoney } from '@zemmz/shared';
import { getPublicEvent } from '@/lib/public-event';
import { siteTextFor } from '@/lib/site-locale';
import { verify } from '@/lib/order-tokens';
import { paymentProvider } from '@/lib/payments';
import { markOrderFailed, markOrderPaid } from '@/lib/orders';

export const metadata: Metadata = { title: 'Test payment', robots: { index: false } };

/** Stands in for the provider's hosted page when PAYMENT_PROVIDER=mock. Never in production. */
export default async function TestPaymentPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  if (paymentProvider() !== 'mock' || process.env.NODE_ENV === 'production') notFound();
  const event = await getPublicEvent(slug);
  const { t } = await siteTextFor(event);
  const id = verify('order', token);
  const order = id ? await prisma.order.findFirst({ where: { id, eventId: event.id, provider: 'mock' } }) : null;
  if (!order) notFound();
  if (order.status === 'PAID') redirect(`/e/${slug}/order/${token}`);
  if (order.status !== 'PENDING') redirect(`/e/${slug}/checkout?payment=expired`);

  async function approve() {
    'use server';
    await markOrderPaid(order!.id, `test_${order!.id.slice(-8)}`);
    redirect(`/e/${slug}/order/${token}`);
  }
  async function decline() {
    'use server';
    await markOrderFailed(order!.id);
    redirect(`/e/${slug}/checkout?payment=failed&retry=${token}`);
  }

  const money = formatMoney(order.totalMinor, order.currency);
  return (
    <div className="mx-auto max-w-[440px] rounded-2xl border border-[var(--line)] p-6">
      <p className="m-0 text-[12px] font-bold tracking-[.08em] text-[var(--muted)]">{t.payment.testTitle.toUpperCase()}</p>
      <h1 className="mb-1 mt-2 text-[26px] font-bold">{money}</h1>
      <p className="mt-0 text-[14px] text-[var(--ink-2)]">{order.buyerName} · <span className="ltr">{order.buyerEmail}</span></p>
      <div className="note warn">{t.payment.testBody}</div>
      <form className="grid gap-2.5">
        <button formAction={approve} className="btn accent">{t.payment.approve(money)}</button>
        <button formAction={decline} className="btn line">{t.payment.decline}</button>
      </form>
    </div>
  );
}
