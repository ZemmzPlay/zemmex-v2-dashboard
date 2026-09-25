import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@zemmz/db';
import { getPublicEvent } from '@/lib/public-event';
import { siteTextFor } from '@/lib/site-locale';
import { verify } from '@/lib/order-tokens';
import { syncOrder } from '@/lib/orders';

export const metadata: Metadata = { title: 'Checking your payment', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** Shown when the buyer is back before the provider has confirmed. Refreshes itself. */
export default async function WaitPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const event = await getPublicEvent(slug);
  const { t } = await siteTextFor(event);
  const id = verify('order', token);
  const order = id ? await prisma.order.findFirst({ where: { id, eventId: event.id } }) : null;
  if (!order) notFound();
  const state = await syncOrder(order).catch(() => 'pending' as const);
  if (state === 'paid') redirect(`/e/${slug}/order/${token}`);
  if (state === 'failed') redirect(`/e/${slug}/checkout?payment=failed&retry=${token}`);
  return (
    <div className="mx-auto max-w-[520px] text-center">
      <meta httpEquiv="refresh" content="4" />
      <div className="mx-auto mb-4 size-10 animate-spin rounded-full border-4 border-[var(--line)] border-t-[var(--accent)]" aria-hidden="true" />
      <h1 className="m-0 text-[26px] font-bold">{t.payment.checkingTitle}</h1>
      <p className="text-[var(--ink-2)]" role="status">{t.payment.checkingBody}</p>
    </div>
  );
}
