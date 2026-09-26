import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma, type PlayPlayer, type Tournament } from '@zemmz/db';
import { resetDb } from '../../../../../tests/factory';
import { confirmResult, endTournament, reopenResult, startTournament } from './bracket';
import { checkIn, entryBlock, joinTeam, register, withdraw } from './entries';
import { checkPlayerCode, normaliseTarget, sendPlayerCode } from './players';
import { playAccess, websiteAllowance } from './billing';
import { markEntryPaid, refundTournament } from './entry-payments';
import { markPurchasePaid } from '../billing';
import { playRenewals } from '../../../../worker/src/jobs';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const DAY = 86_400_000;
let n = 0;

async function project(opts: { lapsed?: boolean } = {}) {
  const org = await prisma.organisation.create({
    data: { name: 'League org', slug: `lg-${Math.random().toString(36).slice(2, 8)}`, planStatus: 'ACTIVE', playPlan: 'PLAY_SEASON', playPlanEndsAt: new Date(Date.now() + (opts.lapsed ? -1 : 30) * DAY) },
  });
  await prisma.user.create({ data: { name: 'Owner', email: `o-${Math.random().toString(36).slice(2, 7)}@test`, passwordHash: 'x', memberships: { create: { organisationId: org.id, role: 'OWNER' } } } });
  const p = await prisma.playProject.create({ data: { organisationId: org.id, slug: `p-${Math.random().toString(36).slice(2, 8)}`, name: 'Test League' } });
  return { org, p };
}

async function tournament(projectId: string, data: Partial<Tournament> = {}) {
  const now = Date.now();
  return prisma.tournament.create({
    data: {
      projectId, slug: `t-${++n}`, name: `Cup ${n}`, game: 'fc', capacity: 8, status: 'PUBLISHED',
      regOpensAt: new Date(now - DAY), regClosesAt: new Date(now + DAY), startsAt: new Date(now + 2 * DAY), endsAt: new Date(now + 3 * DAY),
      ...data,
    } as never,
  });
}

async function player(projectId: string, extra: Partial<PlayPlayer> = {}) {
  const i = ++n;
  return prisma.playPlayer.create({ data: { projectId, firstName: 'P', lastName: String(i), gamerTag: `Tag${i}`, email: `p${i}@test`, country: 'KW', verification: 'VERIFIED', ...extra } as never });
}

describe('player sign-in codes', () => {
  it('reads emails and international phone numbers', () => {
    expect(normaliseTarget(' Ali@Example.COM ')).toEqual({ kind: 'email', value: 'ali@example.com' });
    expect(normaliseTarget('+965 5000 0000')).toEqual({ kind: 'phone', value: '+96550000000' });
    expect(normaliseTarget('50000000')).toBeNull();
  });

  it('accepts the right code once, and stops after five wrong tries', async () => {
    const { p } = await project();
    await sendPlayerCode(p, { kind: 'email', value: 'a@test' }, 'en');
    const code = (await prisma.outboundMessage.findFirstOrThrow({ where: { toAddress: 'a@test' } })).subject.match(/\d{6}/)![0];
    expect(await checkPlayerCode(p.id, 'a@test', code)).toBe(true);
    expect(await checkPlayerCode(p.id, 'a@test', code)).toBe(false);

    await sendPlayerCode(p, { kind: 'email', value: 'b@test' }, 'en');
    const good = (await prisma.outboundMessage.findFirstOrThrow({ where: { toAddress: 'b@test' } })).subject.match(/\d{6}/)![0];
    const bad = good === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect(await checkPlayerCode(p.id, 'b@test', bad)).toBe(false);
    expect(await checkPlayerCode(p.id, 'b@test', good)).toBe(false);
  });
});

describe('registering', () => {
  it('holds the last place for one player only', async () => {
    const { p } = await project();
    const t = await tournament(p.id, { capacity: 1 });
    const [a, b] = [await player(p.id), await player(p.id)];
    const results = await Promise.allSettled([register(t, a, { locale: 'en' }), register(t, b, { locale: 'en' })]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.entry.count({ where: { tournamentId: t.id } })).toBe(1);
  });

  it('checks eligibility: verification, country, blacklist and duplicates', async () => {
    const { p } = await project();
    const t = await tournament(p.id, { verifiedOnly: true, countries: ['SA'] });
    expect(await entryBlock(t, await player(p.id, { verification: 'PENDING', country: 'SA' }), 'en')).toMatch(/verified/);
    expect(await entryBlock(t, await player(p.id, { country: 'KW' }), 'en')).toMatch(/country/);
    expect(await entryBlock(t, await player(p.id, { country: 'SA', blacklisted: true }), 'en')).toMatch(/can’t register/);
    const ok = await player(p.id, { country: 'SA' });
    expect(await entryBlock(t, ok, 'en')).toBeNull();
    await register(t, ok, { locale: 'en' });
    expect(await entryBlock(t, ok, 'en')).toMatch(/already registered/);
  });

  it('closes registration when the plan has lapsed', async () => {
    const { p } = await project({ lapsed: true });
    const t = await tournament(p.id);
    await expect(register(t, await player(p.id), { locale: 'en' })).rejects.toThrow(/paused/);
  });

  it('forms teams with a code, and needs a full team to check in', async () => {
    const { p } = await project();
    const t = await tournament(p.id, { teamSize: 2, checkIn: true, startsAt: new Date(Date.now() + 30 * 60_000), regClosesAt: new Date(Date.now() + 10 * 60_000) });
    const [cap, mate, extra] = [await player(p.id), await player(p.id), await player(p.id)];
    const { entry } = await register(t, cap, { teamName: 'Falcons', locale: 'en' });
    await expect(checkIn(t, cap, 'en')).rejects.toThrow(/needs 2 players/);
    await expect(joinTeam(t, mate, 'WRONG', 'en')).rejects.toThrow(/doesn’t match/);
    await joinTeam(t, mate, entry.joinCode.toLowerCase(), 'en');
    await expect(joinTeam(t, extra, entry.joinCode, 'en')).rejects.toThrow(/already full/);
    await checkIn(t, mate, 'en');
    expect((await prisma.entry.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe('CHECKED_IN');
  });

  it('a captain withdrawing withdraws the team; a teammate just leaves', async () => {
    const { p } = await project();
    const t = await tournament(p.id, { teamSize: 2 });
    const [cap, mate] = [await player(p.id), await player(p.id)];
    const { entry } = await register(t, cap, { teamName: 'Hawks', locale: 'en' });
    await joinTeam(t, mate, entry.joinCode, 'en');
    await withdraw(t, mate, 'en');
    expect(await prisma.entryMember.count({ where: { entryId: entry.id } })).toBe(1);
    await withdraw(t, cap, 'en');
    expect((await prisma.entry.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe('WITHDRAWN');
  });

  it('holds paid entries until paid, and refunds them when cancelled', async () => {
    const { p } = await project();
    const t = await tournament(p.id, { entryFeeMinor: 2_500 });
    const a = await player(p.id);
    const { entry, price } = await register(t, a, { locale: 'en' });
    expect(entry.status).toBe('PENDING_PAYMENT');
    expect(price.feeMinor).toBeGreaterThan(0);
    const o = await prisma.entryOrder.create({ data: { tournamentId: t.id, entryId: entry.id, playerId: a.id, currency: 'AED', amountMinor: 2_500, feeMinor: price.feeMinor, totalMinor: price.totalMinor, provider: 'mock' } });
    expect(await markEntryPaid(o.id, 'test_1')).toBe(true);
    expect(await markEntryPaid(o.id, 'test_1')).toBe(false);
    expect((await prisma.entry.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe('REGISTERED');
    await endTournament(t.id);
    expect(await refundTournament(t.id, 'cancelled')).toEqual({ done: 1, failed: 0 });
    expect(await prisma.entryOrder.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({ status: 'REFUNDED', refundedMinor: 2_500 });
    expect((await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } })).status).toBe('CANCELLED');
  });
});

describe('running a bracket', () => {
  it('plays a single-elimination cup to the end and sets places and prizes', async () => {
    const { p } = await project();
    const t = await tournament(p.id, { prizes: [{ place: 1, amountMinor: 100_000, label: '' }, { place: 2, amountMinor: 50_000, label: '' }] as never });
    for (let i = 0; i < 5; i++) await register(t, await player(p.id), { locale: 'en' });
    expect(await startTournament(t.id)).toEqual({ entrants: 5, withdrawn: 0 });
    for (let guard = 0; guard < 10; guard++) {
      const next = await prisma.match.findFirst({ where: { tournamentId: t.id, status: 'READY' }, orderBy: [{ round: 'asc' }, { position: 'asc' }] });
      if (!next) break;
      await confirmResult({ matchId: next.id, scoreA: 2, scoreB: 1, by: 'Admin' });
    }
    const done = await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } });
    expect(done.status).toBe('ENDED');
    const places = (await prisma.entry.findMany({ where: { tournamentId: t.id } })).map((e) => e.place).sort();
    expect(places.slice(0, 2)).toEqual([1, 2]);
    expect(await prisma.prizeAward.count({ where: { tournamentId: t.id } })).toBe(2);
  });

  it('reopens a result only while nothing later depends on it', async () => {
    const { p } = await project();
    const t = await tournament(p.id);
    for (let i = 0; i < 4; i++) await register(t, await player(p.id), { locale: 'en' });
    await startTournament(t.id);
    const [m1, m2] = await prisma.match.findMany({ where: { tournamentId: t.id, round: 1 }, orderBy: { position: 'asc' } });
    await confirmResult({ matchId: m1.id, scoreA: 2, scoreB: 0, by: 'Admin' });
    await reopenResult(m1.id);
    expect((await prisma.match.findUniqueOrThrow({ where: { id: m1.id } })).status).toBe('READY');
    await confirmResult({ matchId: m1.id, scoreA: 2, scoreB: 0, by: 'Admin' });
    await confirmResult({ matchId: m2.id, scoreA: 0, scoreB: 2, by: 'Admin' });
    const final = await prisma.match.findFirstOrThrow({ where: { tournamentId: t.id, round: 2 } });
    await confirmResult({ matchId: final.id, scoreA: 1, scoreB: 2, by: 'Admin' });
    await expect(reopenResult(m1.id)).rejects.toThrow();
  });

  it('refuses a draw and needs two ready entrants to start', async () => {
    const { p } = await project();
    const t = await tournament(p.id, { checkIn: true });
    await register(t, await player(p.id), { locale: 'en' });
    await register(t, await player(p.id), { locale: 'en' });
    await expect(startTournament(t.id)).rejects.toThrow(/At least two/);
    await prisma.entry.updateMany({ where: { tournamentId: t.id }, data: { status: 'CHECKED_IN' } });
    await startTournament(t.id);
    const m = await prisma.match.findFirstOrThrow({ where: { tournamentId: t.id } });
    await expect(confirmResult({ matchId: m.id, scoreA: 1, scoreB: 1, by: 'Admin' })).rejects.toThrow();
  });
});

describe('plans', () => {
  it('starts with a trial, lapses, and comes back when paid', async () => {
    const { org } = await project({ lapsed: true });
    expect((await playAccess(org)).open).toBe(false);
    expect(await websiteAllowance(org)).toMatch(/ended/);
    const pp = await prisma.planPurchase.create({ data: { organisationId: org.id, plan: 'PLAY_CLUB', months: 1, amountMinor: 19_900, vatMinor: 0, totalMinor: 19_900, provider: 'mock' } });
    await markPurchasePaid(pp.id, 'test');
    const o = await prisma.organisation.findUniqueOrThrow({ where: { id: org.id } });
    expect(o.playPlan).toBe('PLAY_CLUB');
    expect(Math.round((o.playPlanEndsAt!.getTime() - Date.now()) / DAY)).toBeGreaterThanOrEqual(28);
    expect((await playAccess(o)).open).toBe(true);
  });

  it('reminds owners once before and once after the plan ends', async () => {
    const { org } = await project();
    await prisma.organisation.update({ where: { id: org.id }, data: { playPlanEndsAt: new Date(Date.now() + 3 * DAY) } });
    expect(await playRenewals()).toBe(1);
    expect(await playRenewals()).toBe(0);
    expect(await playRenewals(new Date(Date.now() + 4 * DAY))).toBe(1);
  });
});
