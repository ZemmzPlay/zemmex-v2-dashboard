import { decideScan, eventType, formatTime, parseScanInput, type ScanMode, type ScanOutcome } from '@zemmz/shared';

/** What /roster returns: enough to decide a scan without the server. */
export interface Roster {
  savedAt: string;
  event: { type: string; timezone: string; creditRule: 'duration' | 'checkin'; thresholdPct: number; allowPassOut: boolean };
  session: { id: string; title: string; startsAt: string; endsAt: string; capacity: number | null; credits: number; gateTicketTypeId: string | null };
  gates: { title: string; gateTicketTypeId: string | null }[];
  people: [number, string, string, string, string | null, string | null, 0 | 1][];
  intervals: Record<string, [string, string | null][]>;
}

export interface QueuedScan {
  id: string;
  sessionId: string;
  mode: ScanMode;
  input: string;
  at: string;
}

/**
 * The same rules as the server (decideScan from @zemmz/shared), run against
 * the saved list. The roster is updated in place so the next scan sees it.
 */
export function scanLocally(roster: Roster, mode: ScanMode, input: string, now = new Date()): ScanOutcome & { inRoom: number; checkedIn: number; at: string } {
  const TY = eventType(roster.event.type);
  const s = roster.session;
  const publicId = parseScanInput(input);
  const row = publicId ? roster.people.find((p) => p[0] === publicId) : undefined;
  const regId = row?.[1];
  const intervals = (regId ? roster.intervals[regId] ?? [] : []).map(([a, b]) => ({ inAt: new Date(a), outAt: b ? new Date(b) : null }));
  const inRoomCount = Object.values(roster.intervals).filter((iv) => iv.some(([, out]) => out === null)).length;
  const tf = (d: Date) => formatTime(d, roster.event.timezone);
  const outcome = decideScan({
    mode, type: TY,
    session: { id: s.id, title: s.title, startsAt: new Date(s.startsAt), endsAt: new Date(s.endsAt), capacity: s.capacity, credits: s.credits, gateTicketTypeId: s.gateTicketTypeId },
    gateForTicket: (tid) => roster.gates.find((g) => g.gateTicketTypeId === tid)?.title,
    registration: row ? { id: row[1], publicId: row[0], name: row[2], detail: row[3], ticketTypeId: row[4], ticketTypeName: row[5], cancelled: row[6] === 1 } : null,
    rawInput: input.trim().slice(0, 24) || '—',
    intervals, inRoomCount,
    creditPolicy: { rule: roster.event.creditRule, thresholdPct: roster.event.thresholdPct },
    passOuts: roster.event.allowPassOut,
    now, formatTime: tf,
  });
  if (regId && outcome.action.type === 'open') (roster.intervals[regId] ??= []).push([now.toISOString(), null]);
  if (regId && outcome.action.type === 'close') {
    const open = roster.intervals[regId]?.find(([, out]) => out === null);
    if (open) open[1] = now.toISOString();
  }
  const inRoom = Object.values(roster.intervals).filter((iv) => iv.some(([, out]) => out === null)).length;
  const checkedIn = Object.keys(roster.intervals).length;
  return { ...outcome, inRoom, checkedIn, at: tf(now) };
}
