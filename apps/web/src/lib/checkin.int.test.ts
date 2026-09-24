import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@zemmz/db';
import { makeEvent, person, resetDb } from '../../../../tests/factory';
import { performScan } from './checkin';
import { createRegistrations } from './registrations';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

async function liveSession(eventId: string, capacity: number | null = null) {
  const now = Date.now();
  return prisma.session.create({
    data: { eventId, title: 'Session 3: Heart failure in the Gulf', startsAt: new Date(now - 30 * 60_000), endsAt: new Date(now + 60 * 60_000), capacity, credits: 1.5, status: 'LIVE' },
  });
}

describe('performScan', () => {
  it('checks in, refuses a double scan, checks out', async () => {
    const { event, user } = await makeEvent();
    const s = await liveSession(event.id);
    await createRegistrations({ event, people: [person(1, event.ticketTypes[0].id)], source: 'WEBSITE' });
    const scan = (mode: 'in' | 'out') => performScan({ event, sessionId: s.id, mode, input: '1001', userId: user.id });

    expect((await scan('in')).kind).toBe('ok');
    const again = await scan('in');
    expect(again.kind).toBe('warn');
    expect(again.inRoom).toBe(1);
    const out = await scan('out');
    expect(out.kind).toBe('out');
    expect(out.inRoom).toBe(0);
    expect(await prisma.attendance.count({ where: { sessionId: s.id } })).toBe(1);
  });

  it('opens exactly one interval when two desks scan the same badge at once', async () => {
    const { event, user } = await makeEvent();
    const s = await liveSession(event.id);
    await createRegistrations({ event, people: [person(1, event.ticketTypes[0].id)], source: 'WEBSITE' });
    const results = await Promise.all(Array.from({ length: 6 }, () => performScan({ event, sessionId: s.id, mode: 'in', input: '1001', userId: user.id })));
    expect(results.filter((r) => r.kind === 'ok')).toHaveLength(1);
    expect(await prisma.attendance.count({ where: { sessionId: s.id, outAt: null } })).toBe(1);
  });

  it('never lets a full workshop go over capacity, even with simultaneous scans', async () => {
    const { event, user } = await makeEvent();
    const s = await liveSession(event.id, 3);
    await createRegistrations({ event, people: Array.from({ length: 8 }, (_, i) => person(i, event.ticketTypes[0].id)), source: 'WEBSITE' });
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => performScan({ event, sessionId: s.id, mode: 'in', input: String(1001 + i), userId: user.id })));
    expect(results.filter((r) => r.kind === 'ok')).toHaveLength(3);
    expect(results.filter((r) => r.title.endsWith('is full'))).toHaveLength(5);
    expect(await prisma.attendance.count({ where: { sessionId: s.id, outAt: null } })).toBe(3);
  });

  it('refuses cancelled registrations and unknown IDs', async () => {
    const { event, user } = await makeEvent();
    const s = await liveSession(event.id);
    const [r] = await createRegistrations({ event, people: [person(1, event.ticketTypes[0].id)], source: 'WEBSITE' });
    await prisma.registration.update({ where: { id: r.id }, data: { status: 'CANCELLED' } });
    expect((await performScan({ event, sessionId: s.id, mode: 'in', input: '1001', userId: user.id })).kind).toBe('err');
    expect((await performScan({ event, sessionId: s.id, mode: 'in', input: '9981', userId: user.id })).title).toBe('ID 9981 not found');
  });

  it('cannot scan into another organisation’s session', async () => {
    const a = await makeEvent();
    const b = await makeEvent();
    const s = await liveSession(b.event.id);
    await expect(performScan({ event: a.event, sessionId: s.id, mode: 'in', input: '1001', userId: a.user.id })).rejects.toThrow('Session not found');
  });
});
