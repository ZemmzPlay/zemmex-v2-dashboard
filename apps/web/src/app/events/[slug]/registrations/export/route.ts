import { prisma } from '@zemmz/db';
import { eventType } from '@zemmz/shared';
import { can, requirePermission } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { registrationWhere } from '@/lib/registration-query';
import { cell } from '@/lib/csv';


export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, event } = await requirePermission(slug, can.editRegistrations);
  const TY = eventType(event.type);
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const rows = await prisma.registration.findMany({
    where: registrationWhere(event.id, sp),
    orderBy: { publicId: 'asc' },
    include: { ticketType: { select: { name: true } }, attendance: { select: { sessionId: true } } },
  });
  const header = [TY.idName, 'Title', 'First name', 'Last name', 'Email', 'Mobile', TY.f1, TY.f2, 'Ticket', 'Status', `${TY.units} attended`, 'Registered (UTC)'];
  const lines = [header.map(cell).join(',')];
  for (const r of rows) {
    lines.push(
      [r.publicId, r.title, r.firstName, r.lastName, r.email, r.mobile, r.field1, r.field2, r.ticketType?.name ?? '', r.status === 'CANCELLED' ? 'Cancelled' : 'Confirmed', new Set(r.attendance.map((a) => a.sessionId)).size, r.createdAt.toISOString()]
        .map(cell)
        .join(','),
    );
  }
  await logActivity(user, event.id, `exported ${rows.length} ${TY.regs.toLowerCase()} to CSV`);
  return new Response('﻿' + lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${event.slug}-${TY.regs.toLowerCase().replace(/\s+/g, '-')}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
