/**
 * Attendance rules. One rule runs through all of zemmz Live:
 * attendance is verified, and only verified attendance unlocks what comes
 * after — certificates, CME points, recordings or an after-show page.
 *
 * These functions are pure so the web app, the worker and the tests share
 * one implementation. Ported from doScan / earned / points in the prototype.
 */
import type { EventTypeDef } from './event-types';

export type SessionStatus = 'upcoming' | 'live' | 'ended';

export interface SessionLike {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number | null;
  credits: number;
  /** For gates: the ticket type this entrance accepts. */
  gateTicketTypeId?: string | null;
}

export interface Interval {
  inAt: Date;
  outAt: Date | null;
}

export function sessionStatusAt(s: Pick<SessionLike, 'startsAt' | 'endsAt'>, now: Date): SessionStatus {
  if (now >= s.endsAt) return 'ended';
  if (now >= s.startsAt) return 'live';
  return 'upcoming';
}

/** Short label: "Session 3" from "Session 3: Heart failure in the Gulf". */
export function shortTitle(title: string): string {
  const head = title.split(':')[0];
  return title.includes(':') && /\d/.test(head) ? head : title;
}

/**
 * Minutes spent in the room for a session, clipped to its start and end.
 * An open interval on a live session is still counting, so returns null.
 * An open interval on an ended session counts to the end (forgot to scan out).
 */
export function minutesInRoom(s: SessionLike, intervals: Interval[], now: Date): number | null {
  if (!intervals.length) return 0;
  const status = sessionStatusAt(s, now);
  let total = 0;
  for (const iv of intervals) {
    let out = iv.outAt;
    if (!out) {
      if (status === 'live') return null;
      out = s.endsAt;
    }
    const a = Math.max(iv.inAt.getTime(), s.startsAt.getTime());
    const b = Math.min(out.getTime(), s.endsAt.getTime());
    total += Math.max(0, b - a);
  }
  return Math.round(total / 60000);
}

export type CreditRule = 'duration' | 'checkin';

export interface CreditPolicy {
  rule: CreditRule;
  /** For 'duration': share of the session a delegate must be in the room, 1–100. */
  thresholdPct: number;
}

/**
 * CME points earned for one session. null while still being earned (live
 * session, still in the room).
 */
export function creditsEarned(s: SessionLike, intervals: Interval[], policy: CreditPolicy, now: Date): number | null {
  if (!intervals.length || !s.credits) return 0;
  if (policy.rule === 'checkin') return s.credits;
  const m = minutesInRoom(s, intervals, now);
  if (m === null) return null;
  const length = (s.endsAt.getTime() - s.startsAt.getTime()) / 60000;
  return m >= (length * policy.thresholdPct) / 100 ? s.credits : 0;
}

export type ScanMode = 'in' | 'out';
export type ScanKind = 'ok' | 'out' | 'warn' | 'err';

export interface ScanRegistration {
  id: string;
  publicId: number;
  name: string;
  detail: string;
  ticketTypeId: string | null;
  ticketTypeName: string | null;
  cancelled: boolean;
}

export interface ScanContext {
  mode: ScanMode;
  type: EventTypeDef;
  session: SessionLike;
  /** Gate names by ticket type, for "send them to Gate B". */
  gateForTicket?: (ticketTypeId: string | null) => string | undefined;
  registration: ScanRegistration | null;
  rawInput: string;
  /** This registration's intervals for this session, oldest first. */
  intervals: Interval[];
  /** People currently in the room (open intervals). */
  inRoomCount: number;
  creditPolicy: CreditPolicy;
  /** Gates: whether guests may leave and come back in. Defaults to yes. */
  passOuts?: boolean;
  now: Date;
  formatTime: (d: Date) => string;
}

export type ScanAction =
  | { type: 'none' }
  | { type: 'open' }
  | { type: 'close' };

export interface ScanOutcome {
  kind: ScanKind;
  title: string;
  detail: string;
  action: ScanAction;
}

/** Digits from a scanner or typed input: "ID 1003", "*1003*", "1003" → 1003. */
export function parseScanInput(raw: string): number | null {
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function decideScan(c: ScanContext): ScanOutcome {
  const { type: TY, session: s, registration: r, mode } = c;
  const none: ScanAction = { type: 'none' };
  const gates = TY.gates;

  if (!r) {
    return { kind: 'err', title: `ID ${c.rawInput} not found`, detail: `Check the ${TY.badge}, or find the person in ${TY.regs}`, action: none };
  }
  if (r.cancelled) {
    return { kind: 'err', title: `${r.name}’s ${TY.one} was cancelled`, detail: `ID ${r.publicId} is no longer valid`, action: none };
  }
  const status = sessionStatusAt(s, c.now);
  if (mode === 'in' && status === 'ended') {
    return { kind: 'err', title: `${shortTitle(s.title)} has ended`, detail: `Choose a ${TY.unit.toLowerCase()} that is running now`, action: none };
  }
  if (gates && mode === 'in' && s.gateTicketTypeId && s.gateTicketTypeId !== r.ticketTypeId) {
    const right = c.gateForTicket?.(r.ticketTypeId);
    return { kind: 'err', title: `Wrong gate for ${r.name}`, detail: `${r.ticketTypeName ?? 'Different'} ticket. Send them to ${right ?? 'the right gate'}`, action: none };
  }

  const open = c.intervals.find((i) => i.outAt === null);
  const hadBefore = c.intervals.length > 0;

  if (mode === 'in') {
    if (gates && hadBefore && !open && c.passOuts === false) {
      return { kind: 'err', title: `${r.name} already came in and left`, detail: 'This event doesn’t allow pass-outs', action: none };
    }
    if (open) {
      return { kind: 'warn', title: `${r.name} is already ${gates ? 'inside' : 'checked in'}`, detail: `Since ${c.formatTime(open.inAt)} · ID ${r.publicId}`, action: none };
    }
    if (s.capacity && c.inRoomCount >= s.capacity) {
      return { kind: 'err', title: `${shortTitle(s.title)} is full`, detail: `${s.capacity} of ${s.capacity} places taken`, action: none };
    }
    return {
      kind: 'ok',
      title: `Welcome${hadBefore ? ' back' : ''}, ${r.name}`,
      detail: `${gates ? 'In' : 'Checked in'} at ${c.formatTime(c.now)} · ${r.detail} · ID ${r.publicId}`,
      action: { type: 'open' },
    };
  }

  // mode === 'out'
  if (!hadBefore) {
    return { kind: 'warn', title: `${r.name} never ${gates ? 'came in' : 'checked in'}`, detail: `Switch to ${TY.inLbl} first if they’re arriving`, action: none };
  }
  if (!open) {
    const last = c.intervals[c.intervals.length - 1];
    return { kind: 'warn', title: `${r.name} already left`, detail: `At ${c.formatTime(last.outAt!)}`, action: none };
  }
  if (gates) {
    return { kind: 'out', title: `Goodbye, ${r.name}`, detail: c.passOuts === false ? 'Scanned out. This event doesn’t allow coming back in.' : 'Pass-out recorded. They can scan back in.', action: { type: 'close' } };
  }
  const stayed = Math.round((c.now.getTime() - Math.max(open.inAt.getTime(), s.startsAt.getTime())) / 60000);
  let detail = `Stayed ${Math.max(0, stayed)} min`;
  if (TY.credits && s.credits && c.creditPolicy.rule === 'duration') {
    // Time so far including this interval; they may still come back in.
    const closed: Interval[] = c.intervals.map((i) => (i === open ? { inAt: i.inAt, outAt: c.now } : i));
    const soFar = minutesInRoom(s, closed, s.endsAt) ?? 0;
    const length = (s.endsAt.getTime() - s.startsAt.getTime()) / 60000;
    if (soFar < (length * c.creditPolicy.thresholdPct) / 100) {
      detail += ` · below ${c.creditPolicy.thresholdPct}%, no points for this session`;
    }
  }
  return { kind: 'out', title: `Goodbye, ${r.name}`, detail, action: { type: 'close' } };
}
