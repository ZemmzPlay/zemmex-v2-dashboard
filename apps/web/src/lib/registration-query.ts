import 'server-only';
import type { Prisma } from '@zemmz/db';

export interface RegFilters {
  q?: string;
  show?: string;
  ticket?: string;
  sort?: string;
}

export const SORTS = {
  newest: [{ publicId: 'desc' }],
  oldest: [{ publicId: 'asc' }],
  name: [{ lastName: 'asc' }, { firstName: 'asc' }],
} satisfies Record<string, Prisma.RegistrationOrderByWithRelationInput[]>;

export type SortKey = keyof typeof SORTS;

/** Search across name, ID, email and mobile; filter by attendance and ticket. */
export function registrationWhere(eventId: string, f: RegFilters): Prisma.RegistrationWhereInput {
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
    case 'cancelled':
      and.push({ status: 'CANCELLED' });
      break;
    default:
      and.push({ status: 'CONFIRMED' });
  }
  if (f.ticket) and.push({ ticketTypeId: f.ticket });
  if (and.length) where.AND = and;
  return where;
}
