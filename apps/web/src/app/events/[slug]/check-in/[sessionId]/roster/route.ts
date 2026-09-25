import { NextResponse } from 'next/server';
import { prisma } from '@zemmz/db';
import { can, requirePermission } from '@/lib/auth';
import { fullName } from '@/lib/format';
import { eventType } from '@zemmz/shared';

/**
 * Everything the console needs to decide scans on its own when the venue's
 * connection drops: the guest list, this session's attendance so far, and
 * the gate rules. Compact arrays, so a 10,000-person event stays small.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; sessionId: string }> }) {
  const { slug, sessionId } = await params;
  const { event } = await requirePermission(slug, can.checkIn);
  const TY = eventType(event.type);
  const session = await prisma.session.findFirst({ where: { id: sessionId, eventId: event.id } });
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [regs, attendance, gates] = await Promise.all([
    prisma.registration.findMany({
      where: { eventId: event.id, status: { in: ['CONFIRMED', 'CANCELLED'] } },
      select: { id: true, publicId: true, title: true, firstName: true, lastName: true, field1: true, status: true, ticketTypeId: true, ticketType: { select: { name: true } } },
    }),
    prisma.attendance.findMany({ where: { sessionId }, select: { registrationId: true, inAt: true, outAt: true }, orderBy: { inAt: 'asc' } }),
    TY.gates ? prisma.session.findMany({ where: { eventId: event.id, kind: 'GATE' }, select: { title: true, gateTicketTypeId: true } }) : Promise.resolve([]),
  ]);
  const intervals: Record<string, [string, string | null][]> = {};
  for (const a of attendance) (intervals[a.registrationId] ??= []).push([a.inAt.toISOString(), a.outAt?.toISOString() ?? null]);
  return NextResponse.json(
    {
      savedAt: new Date().toISOString(),
      event: { type: event.type, timezone: event.timezone, creditRule: event.creditRule, thresholdPct: event.creditThresholdPct, allowPassOut: event.allowPassOut },
      session: { id: session.id, title: session.title, startsAt: session.startsAt.toISOString(), endsAt: session.endsAt.toISOString(), capacity: session.capacity, credits: session.credits, gateTicketTypeId: session.gateTicketTypeId },
      gates,
      // [publicId, id, name, detail, ticketTypeId, ticketTypeName, cancelled]
      people: regs.map((r) => [r.publicId, r.id, fullName(r), r.field1 || r.ticketType?.name || TY.guest, r.ticketTypeId, r.ticketType?.name ?? null, r.status !== 'CONFIRMED' ? 1 : 0]),
      intervals,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
