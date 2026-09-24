import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@zemmz/db';
import { makeEvent, resetDb } from '../../../tests/factory';
import { dispatchOutbox, transitionSessions } from './jobs';
import { logProvider, PermanentSendError, type Provider } from './providers';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const queue = (eventId: string, n: number, channel: 'EMAIL' | 'SMS' = 'EMAIL') =>
  prisma.outboundMessage.createMany({ data: Array.from({ length: n }, (_, i) => ({ eventId, channel, toAddress: `p${i}@example.com`, subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' })) });

describe('transitionSessions', () => {
  it('moves sessions to live and ended with the clock', async () => {
    const { event } = await makeEvent();
    const now = new Date('2026-09-22T10:40:00Z');
    const mk = (start: string, end: string) => prisma.session.create({ data: { eventId: event.id, title: start, startsAt: new Date(start), endsAt: new Date(end) } });
    const past = await mk('2026-09-22T06:00:00Z', '2026-09-22T07:30:00Z');
    const live = await mk('2026-09-22T10:00:00Z', '2026-09-22T11:30:00Z');
    const later = await mk('2026-09-22T12:00:00Z', '2026-09-22T13:00:00Z');
    const r = await transitionSessions(now);
    expect(r).toMatchObject({ live: 1, ended: 1 });
    const status = async (id: string) => (await prisma.session.findUniqueOrThrow({ where: { id } })).status;
    expect(await status(past.id)).toBe('ENDED');
    expect(await status(live.id)).toBe('LIVE');
    expect(await status(later.id)).toBe('UPCOMING');
    expect(await transitionSessions(now)).toMatchObject({ live: 0, ended: 0, upcoming: 0 });
  });
});

describe('dispatchOutbox', () => {
  it('delivers queued messages once', async () => {
    const { event } = await makeEvent();
    await queue(event.id, 3);
    expect(await dispatchOutbox(logProvider)).toMatchObject({ claimed: 3, sent: 3 });
    expect(await dispatchOutbox(logProvider)).toMatchObject({ claimed: 0 });
    expect(await prisma.outboundMessage.count({ where: { status: 'SENT' } })).toBe(3);
  });

  it('does not send anything twice when two workers run at once', async () => {
    const { event } = await makeEvent();
    await queue(event.id, 40);
    const sent: string[] = [];
    const counting: Provider = { name: 'count', sendEmail: async (m) => (sent.push(m.id), { providerMessageId: m.id }) };
    await Promise.all([dispatchOutbox(counting), dispatchOutbox(counting), dispatchOutbox(counting)]);
    expect(sent).toHaveLength(40);
    expect(new Set(sent).size).toBe(40);
  });

  it('retries temporary failures later and gives up on permanent ones', async () => {
    const { event } = await makeEvent();
    await queue(event.id, 1);
    await queue(event.id, 1, 'SMS');
    const flaky: Provider = { name: 'flaky', sendEmail: async () => { throw new Error('503 busy'); } };
    await dispatchOutbox(flaky);
    const email = await prisma.outboundMessage.findFirstOrThrow({ where: { channel: 'EMAIL' } });
    expect(email.status).toBe('QUEUED');
    expect(email.sendAfter.getTime()).toBeGreaterThan(Date.now());
    const sms = await prisma.outboundMessage.findFirstOrThrow({ where: { channel: 'SMS' } });
    expect(sms.status).toBe('FAILED');
    expect(sms.lastError).toContain('No SMS provider');

    const hard: Provider = { name: 'hard', sendEmail: async () => { throw new PermanentSendError('400 bad address'); } };
    await prisma.outboundMessage.update({ where: { id: email.id }, data: { sendAfter: new Date(0) } });
    await dispatchOutbox(hard);
    expect((await prisma.outboundMessage.findUniqueOrThrow({ where: { id: email.id } })).status).toBe('FAILED');
  });
});
