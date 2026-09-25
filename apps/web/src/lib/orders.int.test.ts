import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@zemmz/db';
import { makeEvent, person, resetDb } from '../../../../tests/factory';
import { createRegistrations, RegistrationError } from './registrations';
import { markOrderFailed, markOrderPaid, refundTickets, RefundError, selfRefundBlock, ticketTakings } from './orders';
import { releaseHeldOrders } from '../../../worker/src/jobs';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

async function pendingOrder(capacity: number | null = null, n = 2) {
  const { event, org } = await makeEvent({ tickets: [{ name: 'Standard', priceMinor: 10_000, capacity }] });
  const tid = event.ticketTypes[0].id;
  const order = await prisma.order.create({
    data: { eventId: event.id, buyerName: 'Rana Haddad', buyerEmail: 'rana@example.com', currency: 'AED', subtotalMinor: 10_000 * n, vatMinor: 500 * n, vatBps: 500, feeMinor: 450 * n, feePassedOn: true, totalMinor: 10_950 * n, provider: 'mock' },
  });
  await createRegistrations({ event, people: Array.from({ length: n }, (_, i) => ({ ...person(i, tid), paidMinor: 10_500 })), source: 'WEBSITE', orderId: order.id, pending: true });
  return { event, org, order, tid };
}

describe('paying for an order', () => {
  it('holds seats without sending anything until the payment is confirmed', async () => {
    const { event, order } = await pendingOrder();
    expect(await prisma.registration.count({ where: { orderId: order.id, status: 'PENDING' } })).toBe(2);
    expect(await prisma.outboundMessage.count({ where: { eventId: event.id } })).toBe(0);
    expect(await markOrderPaid(order.id, 'pi_1')).toBe(true);
    expect(await prisma.registration.count({ where: { orderId: order.id, status: 'CONFIRMED' } })).toBe(2);
    expect(await prisma.outboundMessage.count({ where: { eventId: event.id } })).toBe(2);
  });

  it('confirms once when the return page and the webhook arrive together', async () => {
    const { event, order } = await pendingOrder();
    const results = await Promise.all([markOrderPaid(order.id, 'pi_1'), markOrderPaid(order.id, 'pi_1'), markOrderPaid(order.id, 'pi_1')]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await prisma.outboundMessage.count({ where: { eventId: event.id } })).toBe(2);
  });

  it('counts held seats against the ticket limit, and frees them when payment fails', async () => {
    const { event, order, tid } = await pendingOrder(2);
    await expect(createRegistrations({ event, people: [person(9, tid)], source: 'WEBSITE' })).rejects.toBeInstanceOf(RegistrationError);
    await markOrderFailed(order.id);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('FAILED');
    await expect(createRegistrations({ event, people: [person(9, tid)], source: 'WEBSITE' })).resolves.toHaveLength(1);
  });

  it('never marks a paid order failed', async () => {
    const { order } = await pendingOrder();
    await markOrderPaid(order.id, 'pi_1');
    expect(await markOrderFailed(order.id)).toBe(false);
    expect(await prisma.registration.count({ where: { orderId: order.id, status: 'CONFIRMED' } })).toBe(2);
  });

  it('still confirms a payment that lands after the hold was released', async () => {
    const { order } = await pendingOrder();
    await prisma.order.update({ where: { id: order.id }, data: { createdAt: new Date(Date.now() - 2 * 3_600_000) } });
    expect(await releaseHeldOrders()).toBe(1);
    expect(await prisma.registration.count({ where: { orderId: order.id, status: 'CANCELLED' } })).toBe(2);
    expect(await markOrderPaid(order.id, 'pi_late')).toBe(true);
    expect(await prisma.registration.count({ where: { orderId: order.id, status: 'CONFIRMED' } })).toBe(2);
  });
});

describe('refunds', () => {
  it('refunds what each ticket cost, keeps the fee, and cancels the tickets', async () => {
    const { event, order } = await pendingOrder();
    await markOrderPaid(order.id, 'pi_1');
    const [first] = await prisma.registration.findMany({ where: { orderId: order.id }, orderBy: { publicId: 'asc' } });
    const r1 = await refundTickets({ orderId: order.id, registrationIds: [first.id], requestedBy: 'buyer', byLabel: 'rana@example.com' });
    expect(r1).toEqual({ amount: 10_500, count: 1 });
    let o = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o.status).toBe('PARTIALLY_REFUNDED');
    expect((await prisma.registration.findUniqueOrThrow({ where: { id: first.id } })).status).toBe('CANCELLED');
    await refundTickets({ orderId: order.id, requestedBy: 'organiser', byLabel: 'Owner' });
    o = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o.status).toBe('REFUNDED');
    expect(o.refundedMinor).toBe(21_000);
    await expect(refundTickets({ orderId: order.id, requestedBy: 'organiser', byLabel: 'Owner' })).rejects.toBeInstanceOf(RefundError);
    expect(await prisma.outboundMessage.count({ where: { eventId: event.id, subject: { startsWith: 'Refund' } } })).toBe(2);
  });

  it('works out takings without VAT and net of refunds', () => {
    expect(ticketTakings({ subtotalMinor: 20_000, discountMinor: 0, vatMinor: 1_000, refundedMinor: 10_500 })).toBe(10_000);
    expect(ticketTakings({ subtotalMinor: 5_000, discountMinor: 1_000 })).toBe(4_000);
  });

  it('closes self-service refunds at the cut-off and for used tickets', async () => {
    const { event } = await pendingOrder();
    // No sessions, so the start is midnight on 22 September in Kuwait: 21:00 UTC on the 21st.
    const reg = { status: 'CONFIRMED', paidMinor: 100, refundedAt: null, _count: { attendance: 0 } };
    const e = { ...event, refundHours: 48 };
    expect(await selfRefundBlock({ ...e, refundHours: null }, reg, new Date('2026-09-01'))).toBe('none');
    expect(await selfRefundBlock(e, reg, new Date('2026-09-19T20:00:00Z'))).toBe(null);
    expect(await selfRefundBlock(e, reg, new Date('2026-09-19T22:00:00Z'))).toBe('closed');
    expect(await selfRefundBlock(e, { ...reg, _count: { attendance: 1 } }, new Date('2026-09-01'))).toBe('used');
  });
});
