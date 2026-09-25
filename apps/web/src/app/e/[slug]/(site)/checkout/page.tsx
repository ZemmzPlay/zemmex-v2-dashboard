import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@zemmz/db';
import { siteTextFor } from '@/lib/site-locale';
import { getPublicEvent, homeState } from '@/lib/public-event';
import { loadFormFields } from '@/lib/form-fields';
import { getQuote, placeOrder } from '../../actions';
import { CheckoutFlow } from './checkout-flow';
import { verify } from '@/lib/order-tokens';
import { paymentProvider, PROVIDER_LABEL } from '@/lib/payments';

export const metadata: Metadata = { title: 'Checkout', robots: { index: false } };

export default async function CheckoutPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string; payment?: string; retry?: string }> }) {
  const { slug } = await params;
  const { t: wantedParam = '', payment, retry } = await searchParams;
  const event = await getPublicEvent(slug);
  const { t, locale } = await siteTextFor(event);

  if (homeState(event) !== 'open') {
    return (
      <div className="wrap py-20 text-center">
        <h1 className="sec-t">{t.closed}</h1>
        <Link href={`/e/${slug}`} className="btn line mt-4">{t.backToEvent}</Link>
      </div>
    );
  }

  const tickets = await prisma.ticketType.findMany({
    where: { eventId: event.id, onSale: true },
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { registrations: { where: { status: { in: ['CONFIRMED', 'PENDING'] } } } } } },
  });
  const initial: Record<string, number> = {};
  for (const part of wantedParam.split(',')) {
    const [id, n] = part.split(':');
    if (tickets.some((x) => x.id === id) && Number(n) > 0) initial[id] = Math.min(10, Math.floor(Number(n)));
  }
  const form = await loadFormFields(event.id, event.currency);

  // Back from a payment that didn't go through: offer the same tickets and details again.
  const retryId = retry ? verify('order', retry) : null;
  const retryOrder = retryId
    ? await prisma.order.findFirst({ where: { id: retryId, eventId: event.id, status: 'FAILED' }, include: { registrations: { orderBy: { publicId: 'asc' } } } })
    : null;
  let initialValues: Record<string, string> | undefined;
  if (retryOrder?.registrations.length) {
    const b = retryOrder.registrations[0];
    for (const r of retryOrder.registrations) if (r.ticketTypeId && tickets.some((x) => x.id === r.ticketTypeId)) initial[r.ticketTypeId] = (initial[r.ticketTypeId] ?? 0) + 1;
    initialValues = { b_title: b.title, b_firstName: b.firstName, b_lastName: b.lastName, b_email: b.email, b_mobile: b.mobile, b_field1: b.field1, b_field2: b.field2 };
    for (const [k, v] of Object.entries((b.answers ?? {}) as Record<string, string>)) initialValues[`b_a_${k}`] = String(v);
    retryOrder.registrations.forEach((r, i) => {
      initialValues![`h${i}_first`] = r.firstName;
      initialValues![`h${i}_last`] = r.lastName;
    });
  }
  const notice = payment === 'cancelled' ? t.payment.cancelled : payment === 'failed' ? t.payment.failed('') : payment === 'expired' ? t.payment.expired : undefined;
  const provider = paymentProvider();

  return (
    <div className="wrap max-w-[760px] py-12">
      <Link href={`/e/${slug}`} className="text-[14px] font-semibold no-underline">{t.dir === 'rtl' ? '→' : '←'} {event.name}</Link>
      <h1 className="sec-t mt-3">{t.getTickets}</h1>
      <CheckoutFlow
        slug={slug}
        currency={event.currency}
        tickets={tickets.map((x) => ({ id: x.id, name: x.name, description: x.description, priceMinor: x.priceMinor, left: x.capacity == null ? null : Math.max(0, x.capacity - x._count.registrations) }))}
        initial={initial}
        fields={form.fields.filter((f) => f.kind !== 'TICKET').map((f) => ({ ...f, label: t.term(f.label) }))}
        quoteAction={getQuote.bind(null, slug)}
        orderAction={placeOrder.bind(null, slug)}
        type={event.type}
        locale={locale}
        provider={PROVIDER_LABEL[provider]}
        testMode={provider === 'mock'}
        refundHours={event.refundHours}
        notice={notice}
        initialValues={initialValues}
      />
    </div>
  );
}
