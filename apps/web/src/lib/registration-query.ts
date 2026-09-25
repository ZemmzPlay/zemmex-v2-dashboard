import 'server-only';
import type { Prisma } from '@zemmz/db';
import { dayKey, zonedTime } from '@zemmz/shared';

export interface RegFilters {
  q?: string;
  show?: string;
  ticket?: string;
  /** Exact value of the type's first profile field, e.g. a speciality. */
  f1?: string;
  sort?: string;
}

export const SORTS = {
  newest: [{ publicId: 'desc' }],
  oldest: [{ publicId: 'asc' }],
  name: [{ lastName: 'asc' }, { firstName: 'asc' }],
} satisfies Record<string, Prisma.RegistrationOrderByWithRelationInput[]>;

export type SortKey = keyof typeof SORTS;

/** Search across name, ID, email and mobile; filter by attendance and ticket. */
export function registrationWhere(eventId: string, f: RegFilters, tz = 'UTC', now = new Date()): Prisma.RegistrationWhereInput {
  const where: Prisma.RegistrationWhereInput = { eventId };
  const and: Prisma.RegistrationWhereInput[] = [];
  const q = f.q?.trim();
  if (q) {
    const or: Prisma.RegistrationWhereInput[] = [
      { firstName: { contains: q, mode: 'insensitive' } },
      { lastName: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { field2: { contains: q, mode: 'insensitive' } },
    ];
    const digits = q.replace(/\D/g, '');
    if (digits && /^[\d\s+()-]+$/.test(q)) {
      if (digits.length <= 9) or.push({ publicId: Number(digits) });
      if (digits.length >= 4) or.push({ mobile: { contains: digits } });
    }
    const parts = q.split(/\s+/);
    if (parts.length >= 2) {
      or.push({ AND: [{ firstName: { contains: parts[0], mode: 'insensitive' } }, { lastName: { contains: parts.slice(1).join(' '), mode: 'insensitive' } }] });
    }
    and.push({ OR: or });
  }
  switch (f.show) {
    case 'checked_in':
      and.push({ status: 'CONFIRMED', attendance: { some: {} } });
      break;
    case 'not_checked_in':
      and.push({ status: 'CONFIRMED', attendance: { none: {} } });
      break;
    case 'no_badge':
      and.push({ status: 'CONFIRMED', badgePrintedAt: null });
      break;
    case 'today':
      // Since midnight in the event's timezone.
      and.push({ status: 'CONFIRMED', createdAt: { gte: zonedTime(dayKey(now, tz), '00:00', tz) } });
      break;
    case 'cancelled':
      and.push({ status: 'CANCELLED' });
      break;
    default:
      and.push({ status: 'CONFIRMED' });
  }
  if (f.ticket) and.push({ ticketTypeId: f.ticket });
  if (f.f1) and.push({ field1: f.f1 });
  if (and.length) where.AND = and;
  return where;
}
