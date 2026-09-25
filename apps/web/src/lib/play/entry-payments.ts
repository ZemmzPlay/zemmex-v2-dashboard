import 'server-only';
import { prisma, type Entry, type EntryOrder, type PlayPlayer, type PlayProject, type Tournament } from '@zemmz/db';
import { sign } from '@/lib/order-tokens';
import { appUrl } from '@/lib/email';
import { cardProcessingMinor, checkPayment, paymentProvider, paymentsReady, PaymentError, refundPayment, startCheckout } from '@/lib/payments';
import { entryPrice } from './entries';

/**
 * Paid entry fees: the same hosted checkout as Live tickets. The entry is
 * PENDING_PAYMENT until the provider confirms, holding its place; the worker
 * releases unpaid ones after an hour.
 */
export async function startEntryPayment(opts: { project: PlayProject; tournament: Tournament; entry: Entry; player: PlayPlayer; locale: 'en' | 'ar' }) {
  const price = entryPrice(opts.tournament);
  if (!paymentsReady()) {
    await prisma.entry.update({ where: { id: opts.entry.id }, data: { status: 'WITHDRAWN' } });
    throw new PaymentError(opts.locale === 'ar' ? 'الدفع غير متاح الآن. لم يُخصم أي مبلغ.' : 'Payments aren’t set up for this website yet. Nothing was charged.');
  }
  const order = await prisma.entryOrder.create({
    data: {
      tournamentId: opts.tournament.id, entryId: opts.entry.id, playerId: opts.player.id, currency: opts.tournament.currency,
      amountMinor: price.amountMinor, feeMinor: price.feeMinor, totalMinor: price.totalMinor, processingMinor: cardProcessingMinor(price.totalMinor), provider: paymentProvider(),
    },
  });
  const token = sign('entry', order.id);
  const base = `${appUrl()}/p/${opts.project.slug}/pay`;
  try {
    const c = await startCheckout({
      orderId: order.id, amountMinor: price.totalMinor, currency: order.currency, locale: opts.locale,
      description: `${opts.tournament.name}: entry for ${opts.entry.name}`,
      buyer: { name: `${opts.player.firstName} ${opts.player.lastName}`, email: opts.player.email },
      returnUrl: `${base}/return?o=${token}&s={SESSION}`, cancelUrl: `${base}/cancel?o=${token}`,
      webhookUrl: `${appUrl()}/api/payments/${paymentProvider()}`, mockUrl: `/p/${opts.project.slug}/pay/test/${token}`,
    });
    await prisma.entryOrder.update({ where: { id: order.id }, data: { providerSession: c.session } });
    return c.url;
  } catch (e) {
    await markEntryFailed(order.id);
    throw e;
  }
}

export async function markEntryPaid(orderId: string, ref: string) {
  return prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ status: string }[]>`SELECT status::text FROM "EntryOrder" WHERE id = ${orderId} FOR UPDATE`;
    if (!row || row.status === 'PAID') return false;
    const o = await tx.entryOrder.update({ where: { id: orderId }, data: { status: 'PAID', paidAt: new Date(), providerRef: ref } });
    // Paid after the hold ran out: the entry comes back, even over capacity; they paid.
    await tx.entry.update({ where: { id: o.entryId }, data: { status: 'REGISTERED' } });
    return true;
  });
}

export async function markEntryFailed(orderId: string) {
  const o = await prisma.entryOrder.findUnique({ where: { id: orderId } });
  if (!o || o.status !== 'PENDING') return false;
  await prisma.$transaction([
    prisma.entryOrder.update({ where: { id: orderId }, data: { status: 'FAILED' } }),
    prisma.entry.updateMany({ where: { id: o.entryId, status: 'PENDING_PAYMENT' }, data: { status: 'WITHDRAWN' } }),
  ]);
  return true;
}

export async function syncEntryOrder(o: Pick<EntryOrder, 'id' | 'status' | 'provider' | 'providerSession'>): Promise<'paid' | 'failed' | 'pending'> {
  if (o.status === 'PAID' || o.status === 'REFUNDED' || o.status === 'PARTIALLY_REFUNDED') return 'paid';
  if (!o.providerSession || o.provider === 'mock') return o.status === 'FAILED' ? 'failed' : 'pending';
  const r = await checkPayment(o.provider, o.providerSession);
  if (r.status === 'paid') {
    await markEntryPaid(o.id, r.ref);
    return 'paid';
  }
  if (r.status === 'failed') {
    await markEntryFailed(o.id);
    return 'failed';
  }
  return o.status === 'FAILED' ? 'failed' : 'pending';
}

/**
 * Refunds an entry fee. As with Live tickets, the platform fee isn't
 * refunded. Safe to call twice: a refunded order is left alone.
 */
export async function refundEntry(orderId: string, reason: string) {
  const o = await prisma.entryOrder.findUnique({ where: { id: orderId } });
  if (!o || o.status !== 'PAID' || !o.providerRef) return false;
  await refundPayment({ provider: o.provider, ref: o.providerRef, amountMinor: o.amountMinor, currency: o.currency, key: `entry-${o.id}`, reason });
  await prisma.entryOrder.update({ where: { id: o.id }, data: { status: 'REFUNDED', refundedMinor: o.amountMinor } });
  return true;
}

/** Refunds every paid entry in a tournament, for a cancellation. Returns how many were refunded and which failed. */
export async function refundTournament(tournamentId: string, reason: string) {
  const orders = await prisma.entryOrder.findMany({ where: { tournamentId, status: 'PAID' } });
  let done = 0;
  const failed: string[] = [];
  for (const o of orders) {
    try {
      if (await refundEntry(o.id, reason)) done++;
    } catch {
      failed.push(o.id);
    }
  }
  return { done, failed: failed.length };
}
