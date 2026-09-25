import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@zemmz/db';
import { eventType, formatDateRange, formatMoney } from '@zemmz/shared';
import { siteTextFor } from '@/lib/site-locale';
import { getPublicEvent } from '@/lib/public-event';
import { verify } from '@/lib/order-tokens';
import { ticketToken } from '@/lib/tokens';
import { fullName } from '@/lib/format';
import { BadgeCard } from '@/components/badge-card';
import { logoUrlFor } from '@/lib/assets';
import { PrintLink } from '../../print-link';

export const metadata: Metadata = { title: 'Your order', robots: { index: false } };

export default async function OrderPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const event = await getPublicEvent(slug);
  const logoUrl = await logoUrlFor(event);
  const TY = eventType(event.type);
  const { t, locale } = await siteTextFor(event);
  const id = verify('order', token);
  const order = id
    ? await prisma.order.findFirst({ where: { id, eventId: event.id }, include: { registrations: { orderBy: { publicId: 'asc' }, include: { ticketType: { include: { gates: { select: { title: true } } } } } } } })
    : null;
  if (!order) notFound();
  const money = (n: number) => formatMoney(n, order.currency);

  return (
    <div className="mx-auto max-w-[760px]">
      <div className="no-print mb-8 text-center">
        <h1 className="m-0 text-[30px] font-bold" style={{ fontFamily: 'var(--serif)' }}>{order.totalMinor ? t.paymentReceived : ''}{t.youreIn}</h1>
        <p className="text-[var(--ink-2)]">
          {t.orderLine(order.registrations.length, order.buyerEmail)}
        </p>
        {order.totalMinor > 0 && (
          <p className="text-[13.5px] text-[var(--muted)]">
            {t.paidLine(money(order.totalMinor), order.feeMinor ? money(order.feeMinor) : null, order.discountMinor ? money(order.discountMinor) : null, order.providerRef ?? '')}
          </p>
        )}
        <PrintLink label={t.printAll} />
      </div>
      <div className="grid gap-8 sm:grid-cols-2">
        {order.registrations.map((r) => (
          <div key={r.id} className="break-inside-avoid">
            <BadgeCard logoUrl={logoUrl} event={event} name={fullName(r)} line2={r.field2} ticket={r.ticketType?.name} gate={TY.gates ? r.ticketType?.gates[0]?.title : undefined} publicId={r.publicId} line1={TY.gates ? undefined : r.field1} text={{ badgeKicker: t.badgeKicker, entry: t.entry, idName: t.v.idName, badge: t.v.badge }} dateRange={formatDateRange(event.startsOn, event.endsOn, 'UTC', locale)} />
            <p className="no-print mt-2 text-center text-[13px]"><Link href={`/e/${slug}/t/${ticketToken(r.id)}`}>{t.openAlone}</Link></p>
          </div>
        ))}
      </div>
    </div>
  );
}
