import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@zemmz/db';
import { makeEvent, person, resetDb } from '../../../../tests/factory';
import { createRegistrations, RegistrationError } from './registrations';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe('createRegistrations', () => {
  it('gives sequential public IDs from 1001 and queues a confirmation email each', async () => {
    const { event } = await makeEvent();
    const regs = await createRegistrations({ event, people: [person(1, event.ticketTypes[0].id), person(2, event.ticketTypes[0].id)], source: 'WEBSITE' });
    expect(regs.map((r) => r.publicId)).toEqual([1001, 1002]);
    const mail = await prisma.outboundMessage.findMany({ where: { eventId: event.id }, orderBy: { toAddress: 'asc' } });
    expect(mail).toHaveLength(2);
    expect(mail[0].subject).toBe('You’re registered (1001)');
    expect(mail[0].status).toBe('QUEUED');
    expect(mail[0].html).toContain('/t/'); // signed e-ticket link
  });

  it('never hands out the same ID twice under concurrent registrations', async () => {
    const { event } = await makeEvent();
    const tid = event.ticketTypes[0].id;
    await Promise.all(Array.from({ length: 25 }, (_, i) => createRegistrations({ event, people: [person(i, tid)], source: 'WEBSITE' })));
    const ids = (await prisma.registration.findMany({ where: { eventId: event.id }, select: { publicId: true } })).map((r) => r.publicId).sort((a, b) => a - b);
    expect(ids).toEqual(Array.from({ length: 25 }, (_, i) => 1001 + i));
  });

  it('does not oversell a ticket type when buyers race for the last seats', async () => {
    const { event } = await makeEvent({ tickets: [{ name: 'Workshop', capacity: 5 }] });
    const tid = event.ticketTypes[0].id;
    const results = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => createRegistrations({ event, people: [person(i, tid)], source: 'WEBSITE' })));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected.every((r) => r.reason instanceof RegistrationError)).toBe(true);
    expect(await prisma.registration.count({ where: { ticketTypeId: tid } })).toBe(5);
  });

  it('refuses tickets that are not on sale, unless an organiser adds them', async () => {
    const { event } = await makeEvent();
    const tid = event.ticketTypes[0].id;
    await prisma.ticketType.update({ where: { id: tid }, data: { onSale: false } });
    await expect(createRegistrations({ event, people: [person(1, tid)], source: 'WEBSITE' })).rejects.toThrow('not on sale');
    const [r] = await createRegistrations({ event, people: [person(1, tid)], source: 'DASHBOARD', bypassSales: true });
    expect(r.publicId).toBe(1001);
  });

  it('rolls back IDs and emails when the surrounding transaction fails', async () => {
    const { event } = await makeEvent();
    await expect(
      prisma.$transaction(async (tx) => {
        await createRegistrations({ event, people: [person(1, event.ticketTypes[0].id)], source: 'WEBSITE', tx });
        throw new Error('payment declined');
      }),
    ).rejects.toThrow('payment declined');
    expect(await prisma.registration.count({ where: { eventId: event.id } })).toBe(0);
    expect(await prisma.outboundMessage.count({ where: { eventId: event.id } })).toBe(0);
    const fresh = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(fresh.nextPublicId).toBe(1001);
  });

  it('stops at the free trial limit, even when people race for the last places, and not once a plan is active', async () => {
    const { event, org } = await makeEvent({ trial: true });
    const tid = event.ticketTypes[0].id;
    await createRegistrations({ event, people: Array.from({ length: 45 }, (_, i) => person(i, tid)), source: 'WEBSITE' });
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => createRegistrations({ event, people: [person(100 + i, tid)], source: 'WEBSITE' })));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
    await expect(createRegistrations({ event, people: [person(200, tid)], source: 'DASHBOARD' })).rejects.toThrow('free trial covers 50');
    await expect(createRegistrations({ event, people: [person(201, tid)], source: 'WEBSITE' })).rejects.toThrow('Contact the organiser');
    await prisma.organisation.update({ where: { id: org.id }, data: { planStatus: 'ACTIVE' } });
    const [r] = await createRegistrations({ event, people: [person(202, tid)], source: 'WEBSITE' });
    expect(r.publicId).toBe(1051);
  });
});
