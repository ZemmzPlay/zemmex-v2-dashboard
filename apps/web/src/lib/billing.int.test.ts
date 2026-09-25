import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@zemmz/db';
import { makeEvent, resetDb } from '../../../../tests/factory';
import { eventAllowance, markPurchasePaid, planQuote } from './billing';
import { planRenewals } from '../../../worker/src/jobs';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const DAY = 86_400_000;

async function owner(organisationId: string) {
  await prisma.user.create({ data: { name: 'Owner', email: `owner-${Math.random().toString(36).slice(2, 7)}@test`, passwordHash: 'x', memberships: { create: { organisationId, role: 'OWNER' } } } });
}

async function purchase(organisationId: string, plan: 'EVENT' | 'SEASON') {
  const q = planQuote(plan, 'United Arab Emirates')!;
  return prisma.planPurchase.create({ data: { organisationId, plan, amountMinor: q.amountMinor, vatMinor: q.vatMinor, totalMinor: q.totalMinor, provider: 'mock' } });
}

describe('paying for a plan', () => {
  it('adds UAE VAT only for organisations in the UAE', () => {
    expect(planQuote('SEASON', 'United Arab Emirates')).toMatchObject({ amountMinor: 2_900_000, vatMinor: 145_000, totalMinor: 3_045_000 });
    expect(planQuote('SEASON', 'Kuwait')).toMatchObject({ vatMinor: 0, totalMinor: 2_900_000 });
    expect(planQuote('ENTERPRISE', 'Kuwait')).toBeNull();
  });

  it('activates a trial for a year, once, and emails the owners', async () => {
    const { org } = await makeEvent({ trial: true });
    await owner(org.id);
    const p = await purchase(org.id, 'SEASON');
    const done = await Promise.all([markPurchasePaid(p.id, 'pi_1'), markPurchasePaid(p.id, 'pi_1')]);
    expect(done.filter(Boolean)).toHaveLength(1);
    const o = await prisma.organisation.findUniqueOrThrow({ where: { id: org.id } });
    expect(o.planStatus).toBe('ACTIVE');
    expect(o.plan).toBe('SEASON');
    expect(Math.round((o.planEndsAt!.getTime() - Date.now()) / DAY)).toBe(365);
    expect(await prisma.outboundMessage.count({ where: { subject: { startsWith: 'Payment received' } } })).toBe(1);
  });

  it('renewing early adds a year to the current end', async () => {
    const { org } = await makeEvent();
    const ends = new Date(Date.now() + 20 * DAY);
    await prisma.organisation.update({ where: { id: org.id }, data: { plan: 'SEASON', planEndsAt: ends } });
    await markPurchasePaid((await purchase(org.id, 'SEASON')).id, 'pi_2');
    const o = await prisma.organisation.findUniqueOrThrow({ where: { id: org.id } });
    expect(Math.round((o.planEndsAt!.getTime() - ends.getTime()) / DAY)).toBe(365);
  });

  it('counts single events paid for, and blocks one more until it is bought', async () => {
    const { org } = await makeEvent({ trial: true });
    await markPurchasePaid((await purchase(org.id, 'EVENT')).id, 'pi_3');
    let o = await prisma.organisation.findUniqueOrThrow({ where: { id: org.id } });
    expect(o.eventCredits).toBe(1);
    expect(await eventAllowance(o)).toMatchObject({ ok: false });
    await markPurchasePaid((await purchase(org.id, 'EVENT')).id, 'pi_4');
    o = await prisma.organisation.findUniqueOrThrow({ where: { id: org.id } });
    expect(o.eventCredits).toBe(2);
    expect(await eventAllowance(o)).toEqual({ ok: true });
  });
});

describe('plan renewals', () => {
  it('reminds once at each step, then pauses after the grace period', async () => {
    const { org } = await makeEvent();
    await owner(org.id);
    const ends = new Date('2027-01-31T20:00:00Z');
    await prisma.organisation.update({ where: { id: org.id }, data: { planEndsAt: ends } });
    const at = (days: number) => new Date(ends.getTime() + days * DAY);
    expect(await planRenewals(at(-40))).toBe(0);
    expect(await planRenewals(at(-25))).toBe(1);
    expect(await planRenewals(at(-24))).toBe(0);
    expect(await planRenewals(at(-5))).toBe(1);
    expect(await planRenewals(at(1))).toBe(1);
    expect((await prisma.organisation.findUniqueOrThrow({ where: { id: org.id } })).planStatus).toBe('ACTIVE');
    expect(await planRenewals(at(15))).toBe(1);
    expect((await prisma.organisation.findUniqueOrThrow({ where: { id: org.id } })).planStatus).toBe('SUSPENDED');
  });
});
