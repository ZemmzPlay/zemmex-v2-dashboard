import type { Metadata } from 'next';
import Link from 'next/link';
import { Fragment } from 'react';
import { notFound } from 'next/navigation';
import { prisma } from '@zemmz/db';
import { eventType, formatMoney, formatShortDateTime } from '@zemmz/shared';
import { can, requirePermission } from '@/lib/auth';
import { invoiceNumber } from '@/lib/orders';
import { PROVIDER_LABEL, type ProviderName } from '@/lib/payments';
import { fullName } from '@/lib/format';
import { sign } from '@/lib/order-tokens';
import { Icon } from '@/components/icon';
import { ConfirmAction } from '@/components/confirm-action';
import { refundOrder } from '../../actions';

export const metadata: Metadata = { title: 'Order' };

export default async function OrderPage({ params }: { params: Promise<{ slug: string; orderId: string }> }) {
  const { slug, orderId } = await params;
  const { user, event } = await requirePermission(slug, can.seeDashboard);
  const TY = eventType(event.type);
  const order = await prisma.order.findFirst({
    where: { id: orderId, eventId: event.id },
    include: {
      registrations: { orderBy: { publicId: 'asc' }, include: { ticketType: true, _count: { select: { attendance: true } } } },
      refunds: { orderBy: { createdAt: 'desc' } },
      promoCode: true,
    },
  });
  if (!order) notFound();
  const money = (n: number) => formatMoney(n, order.currency);
  const refundable = can.manageEvent(user.role) && (order.status === 'PAID' || order.status === 'PARTIALLY_REFUNDED');
  const open = order.registrations.filter((r) => !r.refundedAt && r.status === 'CONFIRMED');
  const openTotal = open.reduce((t, r) => t + r.paidMinor, 0);
  const provider = PROVIDER_LABEL[order.provider as ProviderName] ?? order.provider;
  const base = `/events/${slug}`;
  const rows: [string, React.ReactNode][] = [
    ['Subtotal', money(order.subtotalMinor)],
    ...(order.discountMinor ? [[`Discount${order.promoCode ? ` (${order.promoCode.code})` : ''}`, `−${money(order.discountMinor)}`] as [string, string]] : []),
    ...(order.vatMinor ? [[`VAT (${order.vatBps / 100}%)`, money(order.vatMinor)] as [string, string]] : []),
    ...(order.feeMinor ? [[order.feePassedOn ? 'Booking fee, paid by the buyer' : 'Booking fee, absorbed', order.feePassedOn ? money(order.feeMinor) : `(${money(order.feeMinor)})`] as [string, string]] : []),
    ['Buyer paid', <b key="t">{money(order.totalMinor)}</b>],
    ...(order.processingMinor ? [['Card processing', `(${money(order.processingMinor)})`] as [string, string]] : []),
    ...(order.refundedMinor ? [['Refunded', <span key="r" className="text-danger">−{money(order.refundedMinor)}</span>] as [string, React.ReactNode]] : []),
  ];

  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href={`${base}/tickets?tab=orders`}>Orders</Link> <Icon name="chevr" size={12} /> <span>{invoiceNumber(order)}</span>
      </nav>
      <div className="ph">
        <div>
          <h1>{order.buyerName}</h1>
          <p>{order.buyerEmail} · {invoiceNumber(order)} · {formatShortDateTime(order.createdAt, event.timezone)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {order.status !== 'PENDING' && order.status !== 'FAILED' && (
            <a className="btn secondary" href={`/e/${slug}/order/${sign('order', order.id)}/receipt`} target="_blank" rel="noreferrer"><Icon name="ext" size={16} /> {order.vatMinor ? 'Tax invoice' : 'Receipt'}</a>
          )}
          {refundable && open.length > 0 && (
            <ConfirmAction
              action={refundOrder.bind(null, slug, order.id, null)}
              label={<><Icon name="ticket" size={16} /> Refund all</>}
              title={`Refund ${money(openTotal)} to ${order.buyerName}?`}
              body={<>This cancels {open.length === 1 ? `${TY.one} ${open[0].publicId}` : `all ${open.length} remaining tickets`}: {open.length === 1 ? 'it stops' : 'they stop'} working at check-in straight away. {money(openTotal)} goes back to the card through {provider}, and the buyer is emailed. {order.feeMinor ? 'The booking fee isn’t refunded.' : ''}</>}
              confirmLabel={`Refund ${money(openTotal)}`}
            />
          )}
        </div>
      </div>
      {order.status === 'PENDING' && <div className="notice warn mb-4">The buyer is on the payment page. Their tickets are held until {formatShortDateTime(new Date(order.createdAt.getTime() + 45 * 60_000), event.timezone)} and released if the payment doesn’t arrive.</div>}
      {order.status === 'FAILED' && <div className="notice info mb-4">This order wasn’t paid, so nothing was charged and its tickets were released.</div>}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>{TY.idName}</th><th>Name</th><th>Ticket</th><th className="num">Paid</th><th>Status</th><th /></tr></thead>
            <tbody>
              {order.registrations.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`${base}/registrations/${r.publicId}`} className="font-semibold">{r.publicId}</Link></td>
                  <td>{fullName(r)}</td>
                  <td>{r.ticketType?.name ?? '—'}</td>
                  <td className="num">{money(r.paidMinor)}</td>
                  <td>
                    {r.refundedAt ? <span className="badge b-danger">Refunded</span>
                      : r.status === 'PENDING' ? <span className="badge b-warn">Held</span>
                      : r.status === 'CANCELLED' ? <span className="badge b-neutral">Cancelled</span>
                      : r._count.attendance ? <span className="badge b-ok">{TY.gates ? 'Came in' : 'Attended'}</span>
                      : <span className="badge b-neutral">Not yet</span>}
                  </td>
                  <td className="text-right">
                    {refundable && !r.refundedAt && r.status === 'CONFIRMED' && open.length > 1 && (
                      <ConfirmAction
                        action={refundOrder.bind(null, slug, order.id, [r.id])}
                        label="Refund"
                        className="btn ghost sm"
                        title={`Refund ${TY.one} ${r.publicId}?`}
                        body={<>{fullName(r)}’s {TY.one} stops working straight away and {money(r.paidMinor)} goes back to the buyer’s card. The other tickets in this order stay valid.</>}
                        confirmLabel={`Refund ${money(r.paidMinor)}`}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card p-4">
          <h2 className="m-0 mb-3 text-[15px] font-semibold">Payment</h2>
          <dl className="m-0 grid grid-cols-[1fr_auto] gap-y-1.5 text-[13.5px]">
            {rows.map(([k, v]) => <Fragment key={k}><dt className="text-muted">{k}</dt><dd className="m-0 text-right">{v}</dd></Fragment>)}
          </dl>
          <p className="mb-0 mt-3 text-[12.5px] text-muted">{provider}{order.providerRef ? ` · ${order.providerRef}` : ''}</p>
          {order.refunds.length > 0 && (
            <>
              <h3 className="mb-2 mt-4 text-[13px] font-semibold">Refunds</h3>
              <ul className="m-0 list-none p-0 text-[13px]">
                {order.refunds.map((r) => (
                  <li key={r.id} className="border-t border-line py-1.5">
                    {money(r.amountMinor)} · {r.status === 'SUCCEEDED' ? 'refunded' : r.status === 'FAILED' ? <span className="text-danger">failed: {r.failure}</span> : 'in progress'}
                    <div className="text-muted">{r.requestedBy === 'buyer' ? 'Cancelled by the buyer' : `By ${r.byLabel}`} · {formatShortDateTime(r.createdAt, event.timezone)}</div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </>
  );
}
