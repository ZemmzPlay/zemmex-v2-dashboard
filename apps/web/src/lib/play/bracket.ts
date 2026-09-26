import 'server-only';
import { prisma, type Match, type Prisma, type Tournament } from '@zemmz/db';
import {
  BracketError, canReopen, isFinished, pairSwiss, placements, planDoubleElimination, planRoundRobin, planSingleElimination,
  recordResult, reopen, swissRoundsFor, type BMatch, type Format,
} from '@zemmz/shared';
import { ACTIVE_ENTRY } from './core';

export { BracketError };

type Tx = Prisma.TransactionClient;

const toEngine = (m: Match): BMatch => ({
  id: m.id, bracket: m.bracket as BMatch['bracket'], round: m.round, position: m.position,
  a: m.entryAId, b: m.entryBId, aBye: m.aBye, bBye: m.bBye, scoreA: m.scoreA, scoreB: m.scoreB, winner: m.winnerId,
  // REVIEW, CONFLICT and PROOF are READY as far as the bracket is concerned.
  status: m.status === 'CONFIRMED' ? 'CONFIRMED' : m.status === 'PENDING' ? 'PENDING' : 'READY',
  next: m.nextMatchId ? { id: m.nextMatchId, slot: m.nextSlot as 'a' | 'b' } : null,
  loser: m.loserMatchId ? { id: m.loserMatchId, slot: m.loserSlot as 'a' | 'b' } : null,
});

/** Writes back the engine's view of changed matches, keeping report statuses (REVIEW, CONFLICT…) on unplayed ones. */
async function save(tx: Tx, before: Map<string, Match>, list: BMatch[], changed: Set<string>) {
  for (const m of list) {
    if (!changed.has(m.id)) continue;
    const old = before.get(m.id);
    const status = m.status === 'READY' && old && ['REVIEW', 'CONFLICT', 'PROOF'].includes(old.status) && old.entryAId === m.a && old.entryBId === m.b ? old.status : m.status;
    await tx.match.update({
      where: { id: m.id },
      data: { entryAId: m.a, entryBId: m.b, aBye: m.aBye, bBye: m.bBye, scoreA: m.scoreA, scoreB: m.scoreB, winnerId: m.winner, status },
    });
  }
}

/** Locks the tournament row so two admins can't move the same bracket at once. */
async function lock(tx: Tx, tournamentId: string) {
  await tx.$queryRaw`SELECT id FROM "Tournament" WHERE id = ${tournamentId} FOR UPDATE`;
  return tx.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
}

async function persistPlan(tx: Tx, tournamentId: string, planned: BMatch[]) {
  const ids = new Map<string, string>();
  for (const m of planned) {
    const row = await tx.match.create({
      data: {
        tournamentId, bracket: m.bracket, round: m.round, position: m.position, entryAId: m.a, entryBId: m.b, aBye: m.aBye, bBye: m.bBye,
        scoreA: m.scoreA, scoreB: m.scoreB, winnerId: m.winner, status: m.status, confirmedBy: m.status === 'CONFIRMED' ? 'Bye' : '',
      },
    });
    ids.set(m.id, row.id);
  }
  for (const m of planned) {
    if (!m.next && !m.loser) continue;
    await tx.match.update({
      where: { id: ids.get(m.id)! },
      data: {
        nextMatchId: m.next ? ids.get(m.next.id) : null, nextSlot: m.next?.slot ?? null,
        loserMatchId: m.loser ? ids.get(m.loser.id) : null, loserSlot: m.loser?.slot ?? null,
      },
    });
  }
}

/**
 * Starts a tournament: seeds the entrants (by seed, then by who registered
 * first), builds the bracket and opens the first matches. With check-in on,
 * only entrants who checked in play; the rest are withdrawn.
 */
export async function startTournament(tournamentId: string) {
  return prisma.$transaction(async (tx) => {
    const t = await lock(tx, tournamentId);
    if (t.status !== 'PUBLISHED') throw new BracketError(t.status === 'LIVE' ? 'This tournament has already started.' : 'Publish the tournament before starting it.');
    const entries = await tx.entry.findMany({ where: { tournamentId, status: { in: t.checkIn ? ['CHECKED_IN'] : ['REGISTERED', 'CHECKED_IN'] } }, include: { _count: { select: { members: true } } }, orderBy: [{ seed: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }] });
    // Teams need a full roster to play.
    const ready = entries.filter((e) => e._count.members >= t.teamSize);
    if (ready.length < 2) throw new BracketError(`At least two ${t.teamSize > 1 ? 'full teams' : 'players'} are needed to start. ${ready.length ? 'Only one is ready.' : 'Nobody is ready yet.'}`);
    const out = entries.filter((e) => !ready.includes(e)).map((e) => e.id);
    if (t.checkIn) await tx.entry.updateMany({ where: { tournamentId, status: 'REGISTERED' }, data: { status: 'WITHDRAWN' } });
    if (out.length) await tx.entry.updateMany({ where: { id: { in: out } }, data: { status: 'WITHDRAWN' } });
    const ids = ready.map((e) => e.id);
    const format = t.format as Format;
    const planned =
      format === 'DOUBLE_ELIMINATION' ? planDoubleElimination(ids)
        : format === 'ROUND_ROBIN' ? planRoundRobin(ids)
          : format === 'SWISS' ? pairSwiss(ids, [], 1)
            : planSingleElimination(ids);
    await tx.match.deleteMany({ where: { tournamentId } });
    await persistPlan(tx, tournamentId, planned);
    await tx.tournament.update({ where: { id: tournamentId }, data: { status: 'LIVE', startedAt: new Date(), currentRound: 1, swissRounds: format === 'SWISS' && !t.swissRounds ? swissRoundsFor(ids.length) : t.swissRounds } });
    return { entrants: ids.length, withdrawn: out.length };
  });
}

async function loadList(tx: Tx, tournamentId: string) {
  const rows = await tx.match.findMany({ where: { tournamentId } });
  return { rows, before: new Map(rows.map((r) => [r.id, r])), list: rows.map(toEngine) };
}

/**
 * Confirms a result and moves the bracket on. Swiss starts the next round
 * when a round is complete; any format ends the tournament when the last
 * match is decided.
 */
export async function confirmResult(opts: { matchId: string; scoreA: number; scoreB: number; by: string; note?: string }) {
  return prisma.$transaction(async (tx) => {
    const match = await tx.match.findUniqueOrThrow({ where: { id: opts.matchId } });
    const t = await lock(tx, match.tournamentId);
    if (t.status !== 'LIVE') throw new BracketError('This tournament isn’t running, so results can’t be entered.');
    const { list, before } = await loadList(tx, t.id);
    const changed = recordResult(list, match.id, opts.scoreA, opts.scoreB);
    await save(tx, before, list, changed);
    await tx.match.update({ where: { id: match.id }, data: { confirmedBy: opts.by, confirmedAt: new Date(), note: opts.note?.slice(0, 300) ?? '', status: 'CONFIRMED' } });
    const ended = await afterResult(tx, t, list);
    return { ended, winnerId: list.find((m) => m.id === match.id)!.winner };
  });
}

export async function reopenResult(matchId: string) {
  return prisma.$transaction(async (tx) => {
    const match = await tx.match.findUniqueOrThrow({ where: { id: matchId } });
    const t = await lock(tx, match.tournamentId);
    if (t.status !== 'LIVE') throw new BracketError('This tournament has ended, so its results are final.');
    const { list, before } = await loadList(tx, t.id);
    if (!canReopen(list, match.id)) throw new BracketError('A later match has already been played, so this result can’t be changed. Reopen that one first.');
    const changed = reopen(list, match.id);
    await save(tx, before, list, changed);
    await tx.match.update({ where: { id: match.id }, data: { confirmedBy: '', confirmedAt: null } });
  });
}

async function afterResult(tx: Tx, t: Tournament, list: BMatch[]) {
  const format = t.format as Format;
  if (format === 'SWISS') {
    const round = Math.max(...list.map((m) => m.round));
    const done = list.filter((m) => m.round === round).every((m) => m.status === 'CONFIRMED');
    if (done && round < t.swissRounds) {
      const entries = (await tx.entry.findMany({ where: { tournamentId: t.id, status: { in: [...ACTIVE_ENTRY] } }, select: { id: true } })).map((e) => e.id);
      await persistPlan(tx, t.id, pairSwiss(entries, list, round + 1));
      await tx.tournament.update({ where: { id: t.id }, data: { currentRound: round + 1 } });
      return false;
    }
  } else {
    const open = list.filter((m) => m.status !== 'CONFIRMED');
    const round = open.length ? Math.min(...open.map((m) => m.round)) : t.currentRound;
    if (round !== t.currentRound) await tx.tournament.update({ where: { id: t.id }, data: { currentRound: round } });
  }
  if (!isFinished(format, list, t.swissRounds)) return false;
  await finish(tx, t, list);
  return true;
}

/** Final places for everyone who played, prize awards for the places with prizes, and the tournament ended. */
async function finish(tx: Tx, t: Tournament, list: BMatch[]) {
  const entries = (await tx.entry.findMany({ where: { tournamentId: t.id, status: { in: [...ACTIVE_ENTRY] } }, select: { id: true } })).map((e) => e.id);
  const places = placements(t.format as Format, entries, list);
  for (const [entryId, place] of places) await tx.entry.update({ where: { id: entryId }, data: { place } });
  const prizes = prizeList(t.prizes);
  await tx.prizeAward.deleteMany({ where: { tournamentId: t.id } });
  for (const p of prizes) {
    const winners = [...places].filter(([, place]) => place === p.place).map(([e]) => e);
    // Tied places share the prize for that place.
    for (const entryId of winners) {
      await tx.prizeAward.create({ data: { tournamentId: t.id, place: p.place, entryId, amountMinor: Math.round(p.amountMinor / winners.length), label: p.label } });
    }
  }
  await tx.tournament.update({ where: { id: t.id }, data: { status: 'ENDED', endedAt: new Date() } });
}

/** Ends a tournament early: matches stop and nobody can report. Places are only set if the bracket finished. */
export async function endTournament(tournamentId: string) {
  return prisma.$transaction(async (tx) => {
    const t = await lock(tx, tournamentId);
    if (t.status === 'ENDED' || t.status === 'CANCELLED') throw new BracketError('This tournament has already ended.');
    if (t.status === 'LIVE') {
      const { list } = await loadList(tx, t.id);
      if (isFinished(t.format as Format, list, t.swissRounds)) return finish(tx, t, list);
      return tx.tournament.update({ where: { id: t.id }, data: { status: 'ENDED', endedAt: new Date() } });
    }
    return tx.tournament.update({ where: { id: t.id }, data: { status: 'CANCELLED', endedAt: new Date() } });
  });
}

export interface Prize { place: number; amountMinor: number; label: string }
export function prizeList(raw: unknown): Prize[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => ({ place: Number(p?.place), amountMinor: Math.max(0, Math.round(Number(p?.amountMinor) || 0)), label: String(p?.label ?? '').slice(0, 80) }))
    .filter((p) => Number.isInteger(p.place) && p.place >= 1 && p.place <= 64 && (p.amountMinor > 0 || p.label))
    .sort((a, b) => a.place - b.place);
}

/** The bracket for display: matches with entrant names, grouped by bracket and round. */
export async function bracketView(tournamentId: string) {
  const [matches, entries] = await Promise.all([
    prisma.match.findMany({ where: { tournamentId }, orderBy: [{ bracket: 'asc' }, { round: 'asc' }, { position: 'asc' }], include: { reports: { where: { replaced: false }, select: { id: true } } } }),
    prisma.entry.findMany({ where: { tournamentId }, select: { id: true, name: true } }),
  ]);
  const name = new Map(entries.map((e) => [e.id, e.name]));
  const reopenable = new Set(matches.filter((m) => canReopen(matches.map(toEngine), m.id)).map((m) => m.id));
  return { matches, name: (id: string | null) => (id ? name.get(id) ?? '—' : null), reopenable };
}
