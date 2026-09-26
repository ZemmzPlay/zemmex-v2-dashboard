import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@zemmz/db';
import { eventType, formatDateRange, formatMoney, localise } from '@zemmz/shared';
import { siteTextFor } from '@/lib/site-locale';
import { getPublicEvent } from '@/lib/public-event';
import { verify } from '@/lib/order-tokens';
import { ticketToken } from '@/lib/tokens';
import { fullName } from '@/lib/format';
import { BadgeCard } from '@/components/badge-card';
import { logoUrlFor } from '@/lib/assets';
import { PrintLink } from '../../print-link';
import { invoiceNumber, selfRefundBlock } from '@/lib/orders';
import { cancelOwnTicket } from '../../../actions';
import { CancelTicket } from './cancel-ticket';

export const metadata: Metadata = { title: 'Your order', robots: { index: false } };

export default async function OrderPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const event = await getPublicEvent(slug);
  const logoUrl = await logoUrlFor(event);
  const TY = eventType(event.type);
  const { t, locale } = await siteTextFor(event);
  const id = verify('order', token);
  const order = id
    ? await prisma.order.findFirst({ where: { id, eventId: event.id }, include: { registrations: { orderBy: { publicId: 'asc' }, include: { _count: { select: { attendance: true } }, ticketType: { include: { gates: { select: { title: true, ar: true } } } } } } } })
    : null;
  if (!order) notFound();
  for (const r of order.registrations) if (r.ticketType) Object.assign(r.ticketType, localise(r.ticketType, locale), { gates: r.ticketType.gates.map((g) => localise(g, locale)) });
  if (order.status === 'PENDING') redirect(`/e/${slug}/pay/wait/${token}`);
  if (order.status === 'FAILED') redirect(`/e/${slug}/checkout?payment=failed&retry=${token}`);
  const money = (n: number) => formatMoney(n, order.currency);
  const blocks = new Map(await Promise.all(order.registrations.map(async (r) => [r.id, await selfRefundBlock(event, r)] as const)));
  const keep = locale === 'ar' ? 'الإبقاء على التذكرة' : 'Keep the ticket';

  return (
    <div className="mx-auto max-w-[760px]">
      <div className="no-print mb-8 text-center">
        <h1 className="m-0 text-[30px] font-bold" style={{ fontFamily: 'var(--serif)' }}>{order.totalMinor ? t.paymentReceived : ''}{t.youreIn}</h1>
        <p className="text-[var(--ink-2)]">
          {t.orderLine(order.registrations.length, order.buyerEmail)}
        </p>
        {order.totalMinor > 0 && (
          <p className="text-[13.5px] text-[var(--muted)]">
            {t.paidLine(money(order.totalMinor), order.feePassedOn && order.feeMinor ? money(order.feeMinor) : null, order.discountMinor ? money(order.discountMinor) : null, invoiceNumber(order))}
            {order.refundedMinor > 0 && <><br /><b className="text-[var(--ink)]">{t.payment.refunded(money(order.refundedMinor))}</b></>}
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <PrintLink label={t.printAll} />
          {order.totalMinor > 0 && <Link href={`/e/${slug}/order/${token}/receipt`} className="btn line">{order.vatMinor > 0 ? t.payment.taxInvoice : t.payment.receipt}</Link>}
        </div>
        {order.totalMinor > 0 && event.refundHours != null && [...blocks.values()].some((b) => b === null) && <p className="fine">{t.payment.refundPolicy(event.refundHours)}</p>}
      </div>
      <div className="grid gap-8 sm:grid-cols-2">
        {order.registrations.map((r) => (
          <div key={r.id} className="break-inside-avoid">
            <BadgeCard logoUrl={logoUrl} event={event} name={fullName(r)} line2={r.field2} ticket={r.ticketType?.name} gate={TY.gates ? r.ticketType?.gates[0]?.title : undefined} publicId={r.publicId} line1={TY.gates ? undefined : r.field1} text={{ badgeKicker: t.badgeKicker, entry: t.entry, idName: t.v.idName, badge: t.v.badge }} dateRange={formatDateRange(event.startsOn, event.endsOn, 'UTC', locale)} />
            {r.refundedAt ? (
              <p className="mt-2 text-center text-[13px] font-semibold text-[var(--danger)]">{t.payment.refundedTicket}</p>
            ) : r.status === 'CONFIRMED' ? (
              <>
                <p className="no-print mt-2 text-center text-[13px]"><Link href={`/e/${slug}/t/${ticketToken(r.id)}`}>{t.openAlone}</Link></p>
                {blocks.get(r.id) === null && (
                  <CancelTicket action={cancelOwnTicket.bind(null, slug, token, r.id)} label={t.payment.cancelTicket} confirm={t.payment.cancelConfirm(money(r.paidMinor))} keep={keep} />
                )}
              </>
            ) : (
              <p className="mt-2 text-center text-[13px] text-[var(--muted)]">{t.cancelledTicket}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
