import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@zemmz/db';
import { eventType, formatMoney, lowerFirst } from '@zemmz/shared';
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
  const id = verify('order', token);
  const order = id
    ? await prisma.order.findFirst({ where: { id, eventId: event.id }, include: { registrations: { orderBy: { publicId: 'asc' }, include: { ticketType: { include: { gates: { select: { title: true } } } } } } } })
    : null;
  if (!order) notFound();
  const money = (n: number) => formatMoney(n, order.currency);

  return (
    <div className="mx-auto max-w-[760px]">
      <div className="no-print mb-8 text-center">
        <h1 className="m-0 text-[30px] font-bold" style={{ fontFamily: 'var(--serif)' }}>{order.totalMinor ? 'Payment received. ' : ''}You’re in</h1>
        <p className="text-[var(--ink-2)]">
          {order.registrations.length} {order.registrations.length === 1 ? 'ticket' : 'tickets'}, each with its own {lowerFirst(TY.idName)}. We’ve emailed {order.buyerEmail}.
        </p>
        {order.totalMinor > 0 && (
          <p className="text-[13.5px] text-[var(--muted)]">
            Paid {money(order.totalMinor)}{order.feeMinor ? `, including a ${money(order.feeMinor)} booking fee` : ''}{order.discountMinor ? ` and ${money(order.discountMinor)} off` : ''}. Reference {order.providerRef}.
          </p>
        )}
        <PrintLink label={`Print all ${TY.badge}s`} />
      </div>
      <div className="grid gap-8 sm:grid-cols-2">
        {order.registrations.map((r) => (
          <div key={r.id} className="break-inside-avoid">
            <BadgeCard logoUrl={logoUrl} event={event} name={fullName(r)} line2={r.field2} ticket={r.ticketType?.name} gate={TY.gates ? r.ticketType?.gates[0]?.title : undefined} publicId={r.publicId} line1={TY.gates ? undefined : r.field1} />
            <p className="no-print mt-2 text-center text-[13px]"><Link href={`/e/${slug}/t/${ticketToken(r.id)}`}>Open this {TY.badge} on its own</Link></p>
          </div>
        ))}
      </div>
    </div>
  );
}
