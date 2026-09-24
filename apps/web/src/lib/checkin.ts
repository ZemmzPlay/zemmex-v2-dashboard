import 'server-only';
import { prisma, type Event } from '@zemmz/db';
import { decideScan, eventType, formatTime, parseScanInput, shortTitle, type ScanMode, type ScanOutcome } from '@zemmz/shared';
import { fullName } from './format';

export interface ScanResult extends ScanOutcome {
  at: string;
  publicId: number | null;
  inRoom: number;
  checkedIn: number;
}

/**
 * Records one scan. Serialised per session with a row lock, so two scanners
 * reading the same badge can't open two intervals, and a full workshop can't
 * be overfilled by simultaneous scans.
 */
export async function performScan(opts: { event: Event; sessionId: string; mode: ScanMode; input: string; userId: string }): Promise<ScanResult> {
  const { event } = opts;
  const TY = eventType(event.type);
  const now = new Date();
  const tf = (d: Date) => formatTime(d, event.timezone);

  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Session" WHERE id = ${opts.sessionId} AND "eventId" = ${event.id} FOR UPDATE`;
    if (!locked.length) throw new Error('Session not found');
    const session = await tx.session.findUniqueOrThrow({ where: { id: opts.sessionId } });

    const publicId = parseScanInput(opts.input);
    const reg = publicId
      ? await tx.registration.findUnique({ where: { eventId_publicId: { eventId: event.id, publicId } }, include: { ticketType: true } })
      : null;
    const intervals = reg
      ? await tx.attendance.findMany({ where: { registrationId: reg.id, sessionId: session.id }, orderBy: { inAt: 'asc' }, select: { id: true, inAt: true, outAt: true } })
      : [];
    const inRoomCount = await tx.attendance.count({ where: { sessionId: session.id, outAt: null } });

    const gates = TY.gates ? await tx.session.findMany({ where: { eventId: event.id, kind: 'GATE' }, select: { title: true, gateTicketTypeId: true } }) : [];

    const outcome = decideScan({
      mode: opts.mode,
      type: TY,
      session: { id: session.id, title: session.title, startsAt: session.startsAt, endsAt: session.endsAt, capacity: session.capacity, credits: session.credits, gateTicketTypeId: session.gateTicketTypeId },
      gateForTicket: (tid) => gates.find((g) => g.gateTicketTypeId === tid)?.title,
      registration: reg
        ? { id: reg.id, publicId: reg.publicId, name: fullName(reg), detail: reg.field1 || reg.ticketType?.name || TY.guest, ticketTypeId: reg.ticketTypeId, ticketTypeName: reg.ticketType?.name ?? null, cancelled: reg.status === 'CANCELLED' }
        : null,
      rawInput: opts.input.trim().slice(0, 24) || '—',
      intervals,
      inRoomCount,
      creditPolicy: { rule: event.creditRule, thresholdPct: event.creditThresholdPct },
      now,
      formatTime: tf,
    });

    let inRoom = inRoomCount;
    if (outcome.action.type === 'open' && reg) {
      await tx.attendance.create({ data: { registrationId: reg.id, sessionId: session.id, inAt: now, scannedInById: opts.userId } });
      if (!reg.badgePrintedAt) await tx.registration.update({ where: { id: reg.id }, data: { badgePrintedAt: now } });
      inRoom++;
    } else if (outcome.action.type === 'close') {
      const open = intervals.find((i) => i.outAt === null)!;
      await tx.attendance.update({ where: { id: open.id }, data: { outAt: now, scannedOutById: opts.userId } });
      inRoom--;
    }
    const checkedIn = (await tx.attendance.groupBy({ by: ['registrationId'], where: { sessionId: session.id } })).length;
    return { ...outcome, at: tf(now), publicId: reg?.publicId ?? null, inRoom, checkedIn };
  });
}

export interface FeedItem {
  kind: 'ok' | 'out';
  title: string;
  at: string;
}

/** Latest scans for a session, from the database (survives reloads, shared between desks). */
export async function recentScans(event: Event, sessionId: string, take = 20): Promise<FeedItem[]> {
  const TY = eventType(event.type);
  const rows = await prisma.attendance.findMany({
    where: { sessionId },
    orderBy: [{ inAt: 'desc' }],
    take: take * 2,
    include: { registration: { select: { title: true, firstName: true, lastName: true } } },
  });
  const events: { kind: 'ok' | 'out'; name: string; t: Date }[] = [];
  for (const r of rows) {
    events.push({ kind: 'ok', name: fullName(r.registration), t: r.inAt });
    if (r.outAt) events.push({ kind: 'out', name: fullName(r.registration), t: r.outAt });
  }
  return events
    .sort((a, b) => b.t.getTime() - a.t.getTime())
    .slice(0, take)
    .map((e) => ({ kind: e.kind, title: e.kind === 'ok' ? `${e.name} · ${TY.gates ? 'in' : 'checked in'}` : `${e.name} · ${TY.gates ? 'pass-out' : 'checked out'}`, at: formatTime(e.t, event.timezone) }));
}

export { shortTitle };
