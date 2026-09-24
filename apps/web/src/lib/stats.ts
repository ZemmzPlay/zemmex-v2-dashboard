import 'server-only';
import { prisma, type Event } from '@zemmz/db';
import { dayKey } from '@zemmz/shared';

export async function eventStats(event: Event) {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const confirmed = { eventId: event.id, status: 'CONFIRMED' as const };

  const [total, last24h, prev24h, checkedInRows, inRoom, revenue, certs, afterPage] = await Promise.all([
    prisma.registration.count({ where: confirmed }),
    prisma.registration.count({ where: { ...confirmed, createdAt: { gte: dayAgo } } }),
    prisma.registration.count({ where: { ...confirmed, createdAt: { gte: new Date(dayAgo.getTime() - 86_400_000), lt: dayAgo } } }),
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(DISTINCT a."registrationId") AS n FROM "Attendance" a
      JOIN "Session" s ON s.id = a."sessionId" WHERE s."eventId" = ${event.id}`,
    prisma.attendance.count({ where: { outAt: null, session: { eventId: event.id, status: 'LIVE' } } }),
    prisma.order.aggregate({ where: { eventId: event.id, status: 'PAID' }, _sum: { subtotalMinor: true, discountMinor: true } }),
    prisma.certificateIssue.count({ where: { registration: { eventId: event.id } } }),
    prisma.afterEventPage.findUnique({ where: { eventId: event.id } }),
  ]);

  return {
    total,
    last24h,
    prev24h,
    checkedIn: Number(checkedInRows[0]?.n ?? 0),
    inRoom,
    revenueMinor: (revenue._sum.subtotalMinor ?? 0) - (revenue._sum.discountMinor ?? 0),
    certificates: certs,
    afterViews: afterPage?.views ?? 0,
  };
}

/** Registrations per day for the last `days` days, in the event's timezone. */
export async function registrationsByDay(event: Event, days = 14) {
  const rows = await prisma.$queryRaw<{ d: string; n: bigint }[]>`
    SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${event.timezone}, 'YYYY-MM-DD') AS d, COUNT(*) AS n
    FROM "Registration"
    WHERE "eventId" = ${event.id} AND status = 'CONFIRMED' AND "createdAt" >= (now() AT TIME ZONE 'UTC') - make_interval(days => ${days}::int)
    GROUP BY 1`;
  const byDay = new Map(rows.map((r) => [r.d, Number(r.n)]));
  const out: { day: string; n: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = dayKey(new Date(Date.now() - i * 86_400_000), event.timezone);
    out.push({ day: key, n: byDay.get(key) ?? 0 });
  }
  return out;
}

/** Top values of the type's first profile field (speciality, discipline, role, ticket). */
export async function breakdownByField1(event: Event, take = 6) {
  const rows = await prisma.registration.groupBy({
    by: ['field1'],
    where: { eventId: event.id, status: 'CONFIRMED', field1: { not: '' } },
    _count: { _all: true },
    orderBy: { _count: { field1: 'desc' } },
    take,
  });
  return rows.map((r) => ({ label: r.field1, n: r._count._all }));
}

/** Sessions with their live counts: checked in (ever) and in the room now. */
export async function sessionsWithCounts(eventId: string) {
  const sessions = await prisma.session.findMany({ where: { eventId }, orderBy: [{ startsAt: 'asc' }, { sortOrder: 'asc' }], include: { gateTicketType: true } });
  const [ever, open] = await Promise.all([
    prisma.$queryRaw<{ sessionId: string; n: bigint }[]>`
      SELECT a."sessionId", COUNT(DISTINCT a."registrationId") AS n FROM "Attendance" a
      JOIN "Session" s ON s.id = a."sessionId" WHERE s."eventId" = ${eventId} GROUP BY 1`,
    prisma.attendance.groupBy({ by: ['sessionId'], where: { outAt: null, session: { eventId } }, _count: { _all: true } }),
  ]);
  const everMap = new Map(ever.map((r) => [r.sessionId, Number(r.n)]));
  const openMap = new Map(open.map((r) => [r.sessionId, r._count._all]));
  return sessions.map((s) => ({ ...s, checkedIn: everMap.get(s.id) ?? 0, inRoom: s.status === 'LIVE' ? openMap.get(s.id) ?? 0 : 0 }));
}
