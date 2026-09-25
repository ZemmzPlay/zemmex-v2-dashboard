import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@zemmz/db';
import { makeEvent, person, resetDb } from '../../../../tests/factory';
import { createRegistrations } from './registrations';
import { poolWhere } from './raffle';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe('poolWhere', () => {
  it('draws only confirmed people, by attendance, leaving out past winners', async () => {
    const { event } = await makeEvent();
    const t = event.ticketTypes[0].id;
    const [a, b, c, d] = await createRegistrations({ event, people: [1, 2, 3, 4].map((i) => person(i, t)), source: 'WEBSITE' });
    const now = Date.now();
    const s1 = await prisma.session.create({ data: { eventId: event.id, title: 'Session 1', startsAt: new Date(now - 3_600_000), endsAt: new Date(now), status: 'ENDED' } });
    const s2 = await prisma.session.create({ data: { eventId: event.id, title: 'Session 2', startsAt: new Date(now), endsAt: new Date(now + 3_600_000), status: 'LIVE' } });
    await prisma.attendance.createMany({ data: [
      { registrationId: a.id, sessionId: s1.id, inAt: new Date(now - 3_000_000) },
      { registrationId: b.id, sessionId: s2.id, inAt: new Date(now) },
      // Cancelled after checking in: never in a draw.
      { registrationId: d.id, sessionId: s1.id, inAt: new Date(now - 3_000_000) },
    ] });
    await prisma.registration.update({ where: { id: d.id }, data: { status: 'CANCELLED' } });
    await prisma.raffleDraw.create({ data: { eventId: event.id, registrationId: a.id, prize: 'Bag' } });

    const ids = async (pool: string, exclude: boolean) =>
      (await prisma.registration.findMany({ where: poolWhere(event.id, pool, exclude), orderBy: { publicId: 'asc' } })).map((r) => r.id);

    expect(await ids('all', false)).toEqual([a.id, b.id, c.id]);
    expect(await ids('in', false)).toEqual([a.id, b.id]);
    expect(await ids('in', true)).toEqual([b.id]);
    expect(await ids(s1.id, false)).toEqual([a.id]);
    expect(await ids(s1.id, true)).toEqual([]);
  });
});
