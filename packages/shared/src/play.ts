/**
 * zemmz Play: games, formats and the bracket engine.
 *
 * Everything here is pure, so the same rules run in tests, on the server and
 * (for previews) in the browser. The database layer (apps/web/src/lib/play)
 * loads a tournament's matches into these shapes, applies a change, calls
 * settle(), and writes back whatever changed.
 */

export interface PlayGame {
  key: string;
  name: string;
  /** For the artwork label. */
  short: string;
  platform: string;
  c1: string;
  c2: string;
  /** Solo games; the others default to teams. */
  solo: boolean;
}

export const PLAY_GAMES: PlayGame[] = [
  { key: 'val', name: 'Valorant', short: 'Valorant', platform: 'PC', c1: '#FF4655', c2: '#8A1024', solo: false },
  { key: 'cod', name: 'Call of Duty: MW3', short: 'COD', platform: 'PlayStation, Xbox, PC', c1: '#3C4A3E', c2: '#0E1410', solo: false },
  { key: 'fc', name: 'EA Sports FC 25', short: 'EA FC', platform: 'PlayStation', c1: '#0FB36B', c2: '#073D2A', solo: true },
  { key: 'tek', name: 'Tekken 8', short: 'Tekken', platform: 'PlayStation', c1: '#F28C28', c2: '#6B1D07', solo: true },
  { key: 'rl', name: 'Rocket League', short: 'Rocket League', platform: 'PC, consoles', c1: '#1D8CF0', c2: '#0B2E70', solo: false },
  { key: 'lol', name: 'League of Legends', short: 'LoL', platform: 'PC', c1: '#C8A548', c2: '#1A2638', solo: false },
  { key: 'ow', name: 'Overwatch 2', short: 'Overwatch', platform: 'PC, consoles', c1: '#F99E1A', c2: '#43484C', solo: false },
  { key: 'mlbb', name: 'Mobile Legends', short: 'MLBB', platform: 'Mobile', c1: '#6B5BFF', c2: '#1B1260', solo: false },
  { key: 'other', name: 'Another game', short: 'Game', platform: '', c1: '#3B25E5', c2: '#0B0660', solo: true },
];
export const playGame = (key: string) => PLAY_GAMES.find((g) => g.key === key) ?? PLAY_GAMES[PLAY_GAMES.length - 1];

export type Format = 'SINGLE_ELIMINATION' | 'DOUBLE_ELIMINATION' | 'ROUND_ROBIN' | 'SWISS';
export const FORMAT_LABEL: Record<Format, { en: string; ar: string; note: string }> = {
  SINGLE_ELIMINATION: { en: 'Single elimination', ar: 'خروج المغلوب', note: 'One loss and you’re out' },
  DOUBLE_ELIMINATION: { en: 'Double elimination', ar: 'خروج المغلوب المزدوج', note: 'Two losses to be knocked out' },
  ROUND_ROBIN: { en: 'Round robin', ar: 'دوري', note: 'Everyone plays everyone' },
  SWISS: { en: 'Swiss', ar: 'النظام السويسري', note: 'Paired by record each round' },
};

/** GCC and wider region, with dialling codes, for eligibility and phone numbers. */
export const PLAY_COUNTRIES: { code: string; name: string; ar: string; flag: string; dial: string; groups: string[] }[] = [
  { code: 'KW', name: 'Kuwait', ar: 'الكويت', flag: '🇰🇼', dial: '+965', groups: ['GCC', 'ME', 'ARAB'] },
  { code: 'SA', name: 'Saudi Arabia', ar: 'السعودية', flag: '🇸🇦', dial: '+966', groups: ['GCC', 'ME', 'ARAB'] },
  { code: 'AE', name: 'United Arab Emirates', ar: 'الإمارات', flag: '🇦🇪', dial: '+971', groups: ['GCC', 'ME', 'ARAB'] },
  { code: 'QA', name: 'Qatar', ar: 'قطر', flag: '🇶🇦', dial: '+974', groups: ['GCC', 'ME', 'ARAB'] },
  { code: 'BH', name: 'Bahrain', ar: 'البحرين', flag: '🇧🇭', dial: '+973', groups: ['GCC', 'ME', 'ARAB'] },
  { code: 'OM', name: 'Oman', ar: 'عُمان', flag: '🇴🇲', dial: '+968', groups: ['GCC', 'ME', 'ARAB'] },
  { code: 'EG', name: 'Egypt', ar: 'مصر', flag: '🇪🇬', dial: '+20', groups: ['ME', 'ARAB'] },
  { code: 'JO', name: 'Jordan', ar: 'الأردن', flag: '🇯🇴', dial: '+962', groups: ['ME', 'ARAB'] },
  { code: 'LB', name: 'Lebanon', ar: 'لبنان', flag: '🇱🇧', dial: '+961', groups: ['ME', 'ARAB'] },
  { code: 'IQ', name: 'Iraq', ar: 'العراق', flag: '🇮🇶', dial: '+964', groups: ['ME', 'ARAB'] },
  { code: 'MA', name: 'Morocco', ar: 'المغرب', flag: '🇲🇦', dial: '+212', groups: ['ARAB'] },
  { code: 'TR', name: 'Türkiye', ar: 'تركيا', flag: '🇹🇷', dial: '+90', groups: ['ME'] },
];
export const playCountry = (code: string) => PLAY_COUNTRIES.find((c) => c.code === code);

/* ------------------------------------------------------------------ */
/* Bracket model                                                         */
/* ------------------------------------------------------------------ */

export type Bracket = 'W' | 'L' | 'F' | 'RR' | 'S';
export type Slot = 'a' | 'b';
export type MatchState = 'PENDING' | 'READY' | 'REVIEW' | 'CONFLICT' | 'PROOF' | 'CONFIRMED';

/** A match as the engine sees it. `id` is any unique key (a database id, or a key while planning). */
export interface BMatch {
  id: string;
  bracket: Bracket;
  round: number;
  position: number;
  a: string | null;
  b: string | null;
  aBye: boolean;
  bBye: boolean;
  scoreA: number | null;
  scoreB: number | null;
  winner: string | null;
  status: MatchState;
  next: { id: string; slot: Slot } | null;
  loser: { id: string; slot: Slot } | null;
}

const blank = (id: string, bracket: Bracket, round: number, position: number): BMatch => ({
  id, bracket, round, position, a: null, b: null, aBye: false, bBye: false, scoreA: null, scoreB: null, winner: null, status: 'PENDING', next: null, loser: null,
});

/** Bracket positions for seeds 1..size so 1 and 2 can only meet in the final: [1, 8, 4, 5, 2, 7, 3, 6] for 8. */
export function seedPositions(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

const nextPow2 = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(2, n)));

/** First-round slots from seeded entries (index 0 is the top seed); missing seeds are byes. */
function firstRoundSlots(entries: string[], size: number) {
  const pos = seedPositions(size);
  return pos.map((seed) => entries[seed - 1] ?? null);
}

/** The main (upper) bracket at `size`, seeded, with byes marked; not yet settled. */
function buildUpper(entries: string[], size: number): BMatch[] {
  const rounds = Math.log2(size);
  const ms: BMatch[] = [];
  for (let r = 1; r <= rounds; r++) for (let p = 0; p < size / 2 ** r; p++) ms.push(blank(`W${r}-${p}`, 'W', r, p));
  for (const m of ms) if (m.round < rounds) m.next = { id: `W${m.round + 1}-${Math.floor(m.position / 2)}`, slot: m.position % 2 ? 'b' : 'a' };
  const slots = firstRoundSlots(entries, size);
  for (const m of ms.filter((x) => x.round === 1)) {
    m.a = slots[2 * m.position];
    m.b = slots[2 * m.position + 1];
    m.aBye = m.a === null;
    m.bBye = m.b === null;
  }
  return ms;
}

export function planSingleElimination(entries: string[]): BMatch[] {
  const ms = buildUpper(entries, nextPow2(entries.length));
  settle(ms);
  return ms;
}

export function planDoubleElimination(entries: string[]): BMatch[] {
  const size = Math.max(4, nextPow2(entries.length));
  const k = Math.log2(size);
  const upper = buildUpper(entries, size);
  const L: BMatch[] = [];
  const lowerCount = (l: number) => (l === 1 ? size / 4 : l % 2 === 0 ? size / 2 ** (l / 2 + 1) : size / 2 ** ((l - 1) / 2 + 2));
  const lowerRounds = 2 * (k - 1);
  for (let l = 1; l <= lowerRounds; l++) for (let p = 0; p < lowerCount(l); p++) L.push(blank(`L${l}-${p}`, 'L', l, p));
  const lower = new Map(L.map((m) => [m.id, m]));
  const up = new Map(upper.map((m) => [m.id, m]));
  // Upper round 1 losers → lower round 1.
  for (let p = 0; p < size / 2; p++) up.get(`W1-${p}`)!.loser = { id: `L1-${Math.floor(p / 2)}`, slot: p % 2 ? 'b' : 'a' };
  for (let l = 1; l <= lowerRounds; l++) {
    const n = lowerCount(l);
    for (let p = 0; p < n; p++) {
      const m = lower.get(`L${l}-${p}`)!;
      if (l < lowerRounds) {
        const nl = l + 1;
        // Into an even round: same position, slot a. Into an odd round: halve.
        m.next = nl % 2 === 0 ? { id: `L${nl}-${p}`, slot: 'a' } : { id: `L${nl}-${Math.floor(p / 2)}`, slot: p % 2 ? 'b' : 'a' };
      }
    }
    if (l % 2 === 0) {
      const wr = l / 2 + 1;
      for (let p = 0; p < n; p++) up.get(`W${wr}-${p}`)!.loser = { id: `L${l}-${n - 1 - p}`, slot: 'b' };
    }
  }
  const final = blank('F1-0', 'F', 1, 0);
  up.get(`W${k}-0`)!.next = { id: 'F1-0', slot: 'a' };
  lower.get(`L${lowerRounds}-0`)!.next = { id: 'F1-0', slot: 'b' };
  const all = [...upper, ...L, final];
  settle(all);
  return all;
}

/** Everyone plays everyone once (circle method); each round, nobody plays twice. */
export function planRoundRobin(entries: string[]): BMatch[] {
  const list: (string | null)[] = entries.slice();
  if (list.length % 2) list.push(null);
  const n = list.length;
  const ms: BMatch[] = [];
  for (let r = 0; r < n - 1; r++) {
    let pos = 0;
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a && b) {
        const m = blank(`RR${r + 1}-${pos}`, 'RR', r + 1, pos++);
        m.a = a;
        m.b = b;
        m.status = 'READY';
        ms.push(m);
      }
    }
    list.splice(1, 0, list.pop()!);
  }
  return ms;
}

export interface Standing {
  entry: string;
  played: number;
  won: number;
  lost: number;
  byes: number;
  /** Score difference, the first tie-break. */
  diff: number;
  points: number;
}

/** Table for round robin (3 points a win) and Swiss (1 a win), from confirmed matches. */
export function standings(entries: string[], matches: BMatch[], pointsPerWin = 3): Standing[] {
  const row = new Map(entries.map((e) => [e, { entry: e, played: 0, won: 0, lost: 0, byes: 0, diff: 0, points: 0 }]));
  for (const m of matches) {
    if (m.status !== 'CONFIRMED' || !m.winner) continue;
    if (m.aBye || m.bBye) {
      const r = row.get(m.winner);
      if (r) Object.assign(r, { byes: r.byes + 1, won: r.won + 1, points: r.points + pointsPerWin });
      continue;
    }
    for (const [me, mine, theirs] of [[m.a, m.scoreA ?? 0, m.scoreB ?? 0], [m.b, m.scoreB ?? 0, m.scoreA ?? 0]] as const) {
      const r = me ? row.get(me) : undefined;
      if (!r) continue;
      r.played++;
      r.diff += mine - theirs;
      if (m.winner === me) {
        r.won++;
        r.points += pointsPerWin;
      } else r.lost++;
    }
  }
  return [...row.values()].sort((x, y) => y.points - x.points || y.diff - x.diff || x.entry.localeCompare(y.entry));
}

/** Swiss rounds for a field: enough for one unbeaten player to be left. */
export const swissRoundsFor = (n: number) => Math.max(1, Math.ceil(Math.log2(Math.max(2, n))));

/**
 * Pairs the next Swiss round: by record, avoiding rematches where possible;
 * with an odd field, the lowest-ranked player without a bye gets one.
 */
export function pairSwiss(entries: string[], played: BMatch[], round: number): BMatch[] {
  const table = standings(entries, played, 1);
  const met = new Set(played.flatMap((m) => (m.a && m.b ? [`${m.a}|${m.b}`, `${m.b}|${m.a}`] : [])));
  const hadBye = new Set(played.filter((m) => m.aBye || m.bBye).map((m) => m.winner));
  let pool = table.map((s) => s.entry);
  const ms: BMatch[] = [];
  let pos = 0;
  if (pool.length % 2) {
    const byeTo = [...pool].reverse().find((e) => !hadBye.has(e)) ?? pool[pool.length - 1];
    pool = pool.filter((e) => e !== byeTo);
    const m = blank(`S${round}-bye`, 'S', round, 999);
    Object.assign(m, { a: byeTo, bBye: true, winner: byeTo, status: 'CONFIRMED' as const });
    ms.push(m);
  }
  while (pool.length) {
    const a = pool.shift()!;
    const i = pool.findIndex((b) => !met.has(`${a}|${b}`));
    const b = pool.splice(i >= 0 ? i : 0, 1)[0];
    const m = blank(`S${round}-${pos}`, 'S', round, pos++);
    Object.assign(m, { a, b, status: 'READY' as const });
    ms.push(m);
  }
  return ms;
}

/* ------------------------------------------------------------------ */
/* Moving results through the bracket                                  */
/* ------------------------------------------------------------------ */

function put(ms: Map<string, BMatch>, to: { id: string; slot: Slot } | null, entry: string | null) {
  if (!to) return;
  const m = ms.get(to.id);
  if (!m) return;
  if (to.slot === 'a') {
    m.a = entry;
    m.aBye = entry === null;
  } else {
    m.b = entry;
    m.bBye = entry === null;
  }
}

/**
 * Fills in what follows from what's known: byes go through on their own, and
 * matches with both entrants become ready. Returns the ids that changed.
 */
export function settle(list: BMatch[]): Set<string> {
  const ms = new Map(list.map((m) => [m.id, m]));
  const changed = new Set<string>();
  for (let guard = 0; guard < list.length * 4 + 10; guard++) {
    let moved = false;
    for (const m of list) {
      if (m.status === 'CONFIRMED') continue;
      const aKnown = m.a !== null || m.aBye;
      const bKnown = m.b !== null || m.bBye;
      if (!aKnown || !bKnown) continue;
      if (m.aBye || m.bBye) {
        // A bye: whoever is there goes through (or nobody, if both are byes).
        const w = m.aBye ? m.b : m.a;
        m.winner = w;
        m.status = 'CONFIRMED';
        put(ms, m.next, w);
        put(ms, m.loser, null);
        changed.add(m.id);
        if (m.next) changed.add(m.next.id);
        if (m.loser) changed.add(m.loser.id);
        moved = true;
      } else if (m.status === 'PENDING') {
        m.status = 'READY';
        changed.add(m.id);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return changed;
}

export class BracketError extends Error {}

/** Records a result and moves the winner (and loser) on. */
export function recordResult(list: BMatch[], id: string, scoreA: number, scoreB: number): Set<string> {
  const ms = new Map(list.map((m) => [m.id, m]));
  const m = ms.get(id);
  if (!m) throw new BracketError('That match no longer exists.');
  if (!m.a || !m.b) throw new BracketError('Both sides of this match aren’t known yet.');
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0) throw new BracketError('Scores are whole numbers, 0 or more.');
  if (scoreA === scoreB) throw new BracketError('Scores are level. Enter the deciding result: this match can’t end in a draw.');
  if (m.status === 'CONFIRMED') throw new BracketError('This result is already confirmed. Reopen it first.');
  m.scoreA = scoreA;
  m.scoreB = scoreB;
  m.winner = scoreA > scoreB ? m.a : m.b;
  m.status = 'CONFIRMED';
  const loser = m.winner === m.a ? m.b : m.a;
  put(ms, m.next, m.winner);
  put(ms, m.loser, loser);
  const changed = settle(list);
  changed.add(m.id);
  if (m.next) changed.add(m.next.id);
  if (m.loser) changed.add(m.loser.id);
  return changed;
}

/** Whether a confirmed result can be undone: nothing it fed has been played yet. */
export function canReopen(list: BMatch[], id: string) {
  const ms = new Map(list.map((m) => [m.id, m]));
  const m = ms.get(id);
  if (!m || m.status !== 'CONFIRMED' || m.aBye || m.bBye) return false;
  const played = (to: BMatch['next']) => {
    const t = to && ms.get(to.id);
    return !!t && t.status === 'CONFIRMED' && !t.aBye && !t.bBye;
  };
  return !played(m.next) && !played(m.loser);
}

export function reopen(list: BMatch[], id: string): Set<string> {
  if (!canReopen(list, id)) throw new BracketError('A later match has already been played, so this result can’t be changed. Reopen that one first.');
  const ms = new Map(list.map((m) => [m.id, m]));
  const m = ms.get(id)!;
  const clear = (to: BMatch['next']) => {
    const t = to && ms.get(to.id);
    if (!t) return;
    if (to!.slot === 'a') Object.assign(t, { a: null, aBye: false });
    else Object.assign(t, { b: null, bBye: false });
    // A bye it auto-resolved has to come undone too.
    if (t.status === 'CONFIRMED') {
      Object.assign(t, { winner: null, status: 'PENDING' });
      clear(t.next);
      clear(t.loser);
    } else t.status = 'PENDING';
  };
  clear(m.next);
  clear(m.loser);
  Object.assign(m, { scoreA: null, scoreB: null, winner: null, status: 'READY' });
  return new Set(list.map((x) => x.id));
}

/** The tournament is over: the last match is decided. */
export function isFinished(format: Format, list: BMatch[], swissRounds = 0) {
  if (!list.length) return false;
  if (format === 'ROUND_ROBIN') return list.every((m) => m.status === 'CONFIRMED');
  if (format === 'SWISS') {
    const last = Math.max(...list.map((m) => m.round));
    return last >= swissRounds && list.filter((m) => m.round === last).every((m) => m.status === 'CONFIRMED');
  }
  const top = format === 'DOUBLE_ELIMINATION' ? list.find((m) => m.bracket === 'F') : list.filter((m) => m.bracket === 'W').sort((x, y) => y.round - x.round)[0];
  return top?.status === 'CONFIRMED';
}

/**
 * Final places. Elimination: by how far each entrant got (entrants knocked
 * out at the same stage share a place: 3rd, 5th…). Round robin and Swiss: the table.
 */
export function placements(format: Format, entries: string[], list: BMatch[]): Map<string, number> {
  const out = new Map<string, number>();
  if (format === 'ROUND_ROBIN' || format === 'SWISS') {
    standings(entries, list, format === 'SWISS' ? 1 : 3).forEach((s, i, all) => {
      const prev = all[i - 1];
      out.set(s.entry, prev && prev.points === s.points && prev.diff === s.diff ? out.get(prev.entry)! : i + 1);
    });
    return out;
  }
  // How late each entrant lost; the champion never did.
  const stage = new Map<string, number>();
  const order = (m: BMatch) => (m.bracket === 'F' ? 10_000 : format === 'DOUBLE_ELIMINATION' ? (m.bracket === 'L' ? m.round * 10 + 5 : m.round * 10) : m.round * 10);
  let champion: string | null = null;
  for (const m of list) {
    if (m.status !== 'CONFIRMED' || !m.winner || m.aBye || m.bBye) continue;
    const loser = m.winner === m.a ? m.b : m.a;
    const final = format === 'DOUBLE_ELIMINATION' ? m.bracket === 'F' : !m.next;
    if (final) champion = m.winner;
    // In double elimination an upper-bracket loss isn't the end.
    if (loser && !(format === 'DOUBLE_ELIMINATION' && m.bracket === 'W')) stage.set(loser, order(m));
  }
  const ranked = [...stage.entries()].sort((x, y) => y[1] - x[1]);
  if (champion) out.set(champion, 1);
  let place = champion ? 2 : 1;
  for (let i = 0; i < ranked.length; ) {
    const same = ranked.filter(([, s]) => s === ranked[i][1]);
    for (const [e] of same) out.set(e, place);
    place += same.length;
    i += same.length;
  }
  return out;
}

/** "Quarterfinals", "Lower round 2", "Grand final"… */
export function roundLabel(format: Format, bracket: Bracket, round: number, totalRounds: number, locale: 'en' | 'ar' = 'en'): string {
  const ar = locale === 'ar';
  if (bracket === 'F') return ar ? 'النهائي الكبير' : 'Grand final';
  if (bracket === 'L') return round === totalRounds ? (ar ? 'نهائي الخاسرين' : 'Lower final') : ar ? `الخاسرين - الجولة ${round}` : `Lower round ${round}`;
  if (bracket === 'W') {
    const left = totalRounds - round;
    const upper = format === 'DOUBLE_ELIMINATION';
    if (left === 0) return upper ? (ar ? 'نهائي الفائزين' : 'Upper final') : ar ? 'النهائي' : 'Final';
    if (left === 1) return upper ? (ar ? 'نصف نهائي الفائزين' : 'Upper semifinals') : ar ? 'نصف النهائي' : 'Semifinals';
    if (left === 2) return upper ? (ar ? 'ربع نهائي الفائزين' : 'Upper quarterfinals') : ar ? 'ربع النهائي' : 'Quarterfinals';
    return ar ? `الجولة ${round}` : upper ? `Upper round ${round}` : `Round ${round}`;
  }
  return ar ? `الجولة ${round}` : `Round ${round}`;
}
