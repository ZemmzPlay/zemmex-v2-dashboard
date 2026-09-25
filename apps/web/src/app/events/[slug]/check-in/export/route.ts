import { prisma } from '@zemmz/db';
import { eventType, formatDate, formatTime } from '@zemmz/shared';
import { can, requirePermission } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { csvLine } from '@/lib/csv';

/** One row per time in the room: who, where, in and out, in the event's timezone. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, event } = await requirePermission(slug, can.editRegistrations);
  const TY = eventType(event.type);
  const tz = event.timezone;
  const rows = await prisma.attendance.findMany({
    where: { session: { eventId: event.id } },
    orderBy: [{ session: { startsAt: 'asc' } }, { inAt: 'asc' }],
    include: { session: { select: { title: true, endsAt: true } }, registration: { select: { publicId: true, firstName: true, lastName: true, email: true, field1: true } } },
  });
  const lines = [csvLine([TY.idName, 'First name', 'Last name', 'Email', TY.f1, TY.unit, 'Date', 'In', 'Out', 'Minutes'])];
  for (const a of rows) {
    const out = a.outAt ?? (a.session.endsAt < new Date() ? a.session.endsAt : null);
    lines.push(csvLine([
      a.registration.publicId, a.registration.firstName, a.registration.lastName, a.registration.email, a.registration.field1, a.session.title,
      formatDate(a.inAt, tz), formatTime(a.inAt, tz), a.outAt ? formatTime(a.outAt, tz) : out ? `${formatTime(out, tz)} (not scanned out)` : 'Still in',
      out ? Math.max(0, Math.round((out.getTime() - a.inAt.getTime()) / 60000)) : '',
    ]));
  }
  await logActivity(user, event.id, `exported ${rows.length} attendance records`);
  return new Response('﻿' + lines.join('\r\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${event.slug}-attendance.csv"`, 'Cache-Control': 'no-store' },
  });
}
