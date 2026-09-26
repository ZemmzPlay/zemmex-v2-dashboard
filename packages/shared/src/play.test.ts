import { describe, expect, it } from 'vitest';
import {
  canReopen, isFinished, pairSwiss, placements, planDoubleElimination, planRoundRobin, planSingleElimination, recordResult, reopen, roundLabel,
  seedPositions, settle, standings, swissRoundsFor, type BMatch,
} from './play';

const players = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
/** Plays everything that's ready, the lower seed number winning (p1 beats p2…). */
function playOut(ms: BMatch[], upsets = new Set<string>()) {
  for (let guard = 0; guard < 500; guard++) {
    const m = ms.find((x) => x.status === 'READY');
    if (!m) return;
    const aWins = Number(m.a!.slice(1)) < Number(m.b!.slice(1));
    const flip = upsets.has(m.id);
    recordResult(ms, m.id, aWins !== flip ? 2 : 0, aWins !== flip ? 0 : 2);
  }
}

describe('seeding', () => {
  it('keeps the top seeds apart until the final', () => {
    expect(seedPositions(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect(seedPositions(4)).toEqual([1, 4, 2, 3]);
  });
});

describe('single elimination', () => {
  it('builds the rounds, gives the top seeds the byes, and finishes with a champion', () => {
    const ms = planSingleElimination(players(6));
    expect(ms.filter((m) => m.round === 1)).toHaveLength(4);
    // Seeds 1 and 2 have byes and are already in round 2.
    expect(ms.filter((m) => m.round === 1 && m.status === 'CONFIRMED').map((m) => m.winner).sort()).toEqual(['p1', 'p2']);
    playOut(ms);
    expect(isFinished('SINGLE_ELIMINATION', ms)).toBe(true);
    const places = placements('SINGLE_ELIMINATION', players(6), ms);
    expect(places.get('p1')).toBe(1);
    expect(places.get('p2')).toBe(2);
    expect([places.get('p3'), places.get('p4')]).toEqual([3, 3]);
    expect([places.get('p5'), places.get('p6')]).toEqual([5, 5]);
  });

  it('refuses draws and results before both sides are known', () => {
    const ms = planSingleElimination(players(4));
    const r1 = ms.find((m) => m.round === 1)!;
    expect(() => recordResult(ms, r1.id, 1, 1)).toThrow(/level/);
    const final = ms.find((m) => m.round === 2)!;
    expect(() => recordResult(ms, final.id, 2, 0)).toThrow(/aren’t known/);
  });

  it('reopens a result only until the next match is played', () => {
    const ms = planSingleElimination(players(4));
    const [m1, m2] = ms.filter((m) => m.round === 1);
    recordResult(ms, m1.id, 2, 0);
    expect(canReopen(ms, m1.id)).toBe(true);
    reopen(ms, m1.id);
    expect(ms.find((m) => m.round === 2)!.a).toBeNull();
    recordResult(ms, m1.id, 0, 2);
    recordResult(ms, m2.id, 2, 1);
    const final = ms.find((m) => m.round === 2)!;
    recordResult(ms, final.id, 2, 0);
    expect(canReopen(ms, m1.id)).toBe(false);
  });
});

describe('double elimination', () => {
  for (const n of [4, 5, 8, 13, 16]) {
    it(`needs two losses to go out, with ${n} entrants`, () => {
      const ms = planDoubleElimination(players(n));
      // One upset in the upper bracket: its loser must still reach the lower bracket and can come back.
      playOut(ms, new Set(['W1-0']));
      expect(isFinished('DOUBLE_ELIMINATION', ms)).toBe(true);
      const losses = new Map<string, number>();
      for (const m of ms) if (m.status === 'CONFIRMED' && !m.aBye && !m.bBye) {
        const l = m.winner === m.a ? m.b! : m.a!;
        losses.set(l, (losses.get(l) ?? 0) + 1);
      }
      const places = placements('DOUBLE_ELIMINATION', players(n), ms);
      const champion = [...places].find(([, p]) => p === 1)![0];
      expect(losses.get(champion) ?? 0).toBeLessThanOrEqual(1);
      for (const [p, l] of losses) if (p !== champion && places.get(p) !== 2) expect(l).toBe(2);
      expect(places.size).toBe(n);
    });
  }
});

describe('round robin', () => {
  it('schedules everyone against everyone once, never twice in a round', () => {
    const ms = planRoundRobin(players(5));
    expect(ms).toHaveLength(10);
    for (const r of new Set(ms.map((m) => m.round))) {
      const seen = ms.filter((m) => m.round === r).flatMap((m) => [m.a, m.b]);
      expect(new Set(seen).size).toBe(seen.length);
    }
    playOut(ms);
    const table = standings(players(5), ms);
    expect(table[0]).toMatchObject({ entry: 'p1', won: 4, points: 12 });
    expect(isFinished('ROUND_ROBIN', ms)).toBe(true);
  });
});

describe('Swiss', () => {
  it('pairs by record, avoids rematches, gives one bye to an odd field', () => {
    const field = players(7);
    const all: BMatch[] = [];
    for (let r = 1; r <= swissRoundsFor(field.length); r++) {
      const round = pairSwiss(field, all, r);
      expect(round.filter((m) => m.bBye)).toHaveLength(1);
      all.push(...round);
      playOut(all);
    }
    const pairs = all.filter((m) => m.a && m.b).map((m) => [m.a, m.b].sort().join('|'));
    expect(new Set(pairs).size).toBe(pairs.length);
    const byes = all.filter((m) => m.bBye).map((m) => m.winner);
    expect(new Set(byes).size).toBe(byes.length);
    expect(isFinished('SWISS', all, swissRoundsFor(7))).toBe(true);
    expect(placements('SWISS', field, all).get('p1')).toBe(1);
  });
});

it('names rounds', () => {
  expect(roundLabel('SINGLE_ELIMINATION', 'W', 3, 3)).toBe('Final');
  expect(roundLabel('SINGLE_ELIMINATION', 'W', 1, 3)).toBe('Quarterfinals');
  expect(roundLabel('DOUBLE_ELIMINATION', 'L', 4, 4, 'ar')).toBe('نهائي الخاسرين');
  expect(roundLabel('DOUBLE_ELIMINATION', 'F', 1, 1)).toBe('Grand final');
  expect(settle([])).toEqual(new Set());
});
