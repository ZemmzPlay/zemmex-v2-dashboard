import 'server-only';
import { prisma, type Event, type Order, type Prisma } from '@zemmz/db';
import { escapeHtml, eventType, formatMoney, siteText, zonedTime } from '@zemmz/shared';
import { queueConfirmations } from './registrations';
import { checkPayment, PaymentError, refundPayment } from './payments';
import { emailLayout } from './email';

/**
 * Marks an order paid and confirms its tickets. Safe to call more than once
 * and from several places at the same time (the return URL, the webhook, the
 * worker): the order row is locked and only the first call does anything.
 *
 * A payment that arrives after the hold expired still confirms the tickets —
 * the buyer paid — even if that puts a ticket type over its limit.
 */
export async function markOrderPaid(orderId: string, ref: string) {
  return prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ status: string }[]>`SELECT status::text FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    if (!row || row.status === 'PAID' || row.status === 'REFUNDED' || row.status === 'PARTIALLY_REFUNDED') return false;
    const order = await tx.order.update({ where: { id: orderId }, data: { status: 'PAID', paidAt: new Date(), providerRef: ref }, include: { event: true, registrations: { select: { id: true } } } });
    const ids = order.registrations.map((r) => r.id);
    await tx.registration.updateMany({ where: { id: { in: ids } }, data: { status: 'CONFIRMED' } });
    if (order.promoCodeId) await tx.promoCode.update({ where: { id: order.promoCodeId }, data: { uses: { increment: 1 } } });
    await queueConfirmations(tx, order.event, ids);
    return true;
  });
}

/** Releases the seats of an order that wasn't paid. Does nothing to a paid order. */
export async function markOrderFailed(orderId: string) {
  return prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ status: string }[]>`SELECT status::text FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    if (!row || row.status !== 'PENDING') return false;
    await tx.order.update({ where: { id: orderId }, data: { status: 'FAILED' } });
    await tx.registration.updateMany({ where: { orderId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
    return true;
  });
}

/** Asks the provider about a pending order and records the answer. */
export async function syncOrder(order: Pick<Order, 'id' | 'status' | 'provider' | 'providerSession'>): Promise<'paid' | 'failed' | 'pending'> {
  if (order.status === 'PAID' || order.status === 'REFUNDED' || order.status === 'PARTIALLY_REFUNDED') return 'paid';
  if (!order.providerSession) return order.status === 'FAILED' ? 'failed' : 'pending';
  const r = await checkPayment(order.provider, order.providerSession);
  if (r.status === 'paid') {
    await markOrderPaid(order.id, r.ref);
    return 'paid';
  }
  if (r.status === 'failed') {
    await markOrderFailed(order.id);
    return 'failed';
  }
  return order.status === 'FAILED' ? 'failed' : 'pending';
}

export class RefundError extends Error {}

/**
 * Refunds some or all tickets of a paid order and cancels them. What each
 * ticket cost (VAT included) is returned; the booking fee is not.
 *
 * The refund row is written first, so a crash between the provider call and
 * the database update leaves a PENDING refund to look at rather than money
 * returned with no record.
 */
export async function refundTickets(opts: { orderId: string; registrationIds?: string[]; requestedBy: 'organiser' | 'buyer'; byLabel: string; reason?: string }) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: opts.orderId }, include: { event: true, registrations: true } });
  if (order.status !== 'PAID' && order.status !== 'PARTIALLY_REFUNDED') throw new RefundError('Only paid orders can be refunded.');
  const regs = order.registrations.filter((r) => !r.refundedAt && r.status !== 'PENDING' && (!opts.registrationIds || opts.registrationIds.includes(r.id)));
  if (!regs.length) throw new RefundError('Those tickets have already been refunded.');
  const amount = regs.reduce((t, r) => t + r.paidMinor, 0);
  const refund = await prisma.refund.create({
    data: { orderId: order.id, registrationIds: regs.map((r) => r.id), amountMinor: amount, requestedBy: opts.requestedBy, byLabel: opts.byLabel },
  });

  let providerRef = 'none';
  if (amount > 0) {
    try {
      providerRef = await refundPayment({
        provider: order.provider, ref: order.providerRef ?? '', amountMinor: amount, currency: order.currency, key: `refund-${refund.id}`,
        reason: opts.reason ?? `${opts.requestedBy} cancelled ${regs.length} ticket(s)`,
      });
    } catch (e) {
      const message = e instanceof PaymentError ? e.message : 'The payment provider could not be reached.';
      await prisma.refund.update({ where: { id: refund.id }, data: { status: 'FAILED', failure: message } });
      throw new RefundError(`${message} Nothing was refunded and the tickets are still valid.`);
    }
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.refund.update({ where: { id: refund.id }, data: { status: 'SUCCEEDED', providerRef } });
    await tx.registration.updateMany({ where: { id: { in: regs.map((r) => r.id) } }, data: { status: 'CANCELLED', refundedAt: now } });
    const refunded = order.refundedMinor + amount;
    const left = order.registrations.filter((r) => !r.refundedAt && !regs.some((x) => x.id === r.id)).length;
    await tx.order.update({ where: { id: order.id }, data: { refundedMinor: refunded, status: left ? 'PARTIALLY_REFUNDED' : 'REFUNDED' } });
    if (amount > 0) await queueRefundEmail(tx, order.event, order, regs.map((r) => r.publicId), amount);
  });
  return { amount, count: regs.length };
}

async function queueRefundEmail(tx: Prisma.TransactionClient, event: Event, order: Order, publicIds: number[], amount: number) {
  const t = siteText(eventType(event.type), order.locale === 'ar' ? 'ar' : 'en');
  const money = formatMoney(amount, order.currency);
  const ids = publicIds.map((n) => `${t.v.idName} ${n}`).join(', ');
  const body = `<p>${escapeHtml(t.payment.mailRefundBody(money, ids))}</p>`;
  await tx.outboundMessage.create({
    data: {
      eventId: event.id, channel: 'EMAIL', toAddress: order.buyerEmail, toName: order.buyerName,
      subject: t.payment.mailRefundSubject(event.name),
      html: emailLayout({ event, kicker: t.payment.mailRefundKicker, bodyHtml: body, locale: order.locale }),
      text: t.payment.mailRefundBody(money, ids),
    },
  });
}

/** Invoice numbers are the order's creation date and the start of its id: stable and unique enough to quote. */
export function invoiceNumber(order: Pick<Order, 'id' | 'createdAt'>) {
  const d = order.createdAt.toISOString().slice(0, 10).replace(/-/g, '');
  return `ZL-${d}-${order.id.slice(-6).toUpperCase()}`;
}

/** When the event starts: its first session, or midnight on the first day in its timezone. */
export async function eventStart(event: Pick<Event, 'id' | 'startsOn' | 'timezone'>) {
  const first = await prisma.session.findFirst({ where: { eventId: event.id }, orderBy: { startsAt: 'asc' }, select: { startsAt: true } });
  return first?.startsAt ?? zonedTime(event.startsOn.toISOString().slice(0, 10), '00:00', event.timezone);
}

/** Why a buyer can't cancel this ticket online, or null when they can. */
export async function selfRefundBlock(event: Pick<Event, 'id' | 'startsOn' | 'timezone' | 'refundHours'>, reg: { status: string; paidMinor: number; refundedAt: Date | null; _count: { attendance: number } }, now = new Date()): Promise<'none' | 'closed' | 'used' | 'free' | null> {
  if (event.refundHours == null) return 'none';
  if (reg.status !== 'CONFIRMED' || reg.refundedAt) return 'none';
  if (reg.paidMinor <= 0) return 'free';
  if (reg._count.attendance > 0) return 'used';
  const start = await eventStart(event);
  if (now.getTime() > start.getTime() - event.refundHours * 3_600_000) return 'closed';
  return null;
}

/** Statuses of orders whose money was taken (even if some came back). */
export const TAKEN = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;

/**
 * Ticket takings: what tickets sold for after discounts, VAT excluded, net of
 * refunds. Refunds include VAT, so it is taken out of them proportionally.
 */
export function ticketTakings(sum: { subtotalMinor?: number | null; discountMinor?: number | null; vatMinor?: number | null; refundedMinor?: number | null }) {
  const gross = (sum.subtotalMinor ?? 0) - (sum.discountMinor ?? 0);
  const vatShare = gross ? (sum.vatMinor ?? 0) / gross : 0;
  return gross - Math.round((sum.refundedMinor ?? 0) / (1 + vatShare));
}
