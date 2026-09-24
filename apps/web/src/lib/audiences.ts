import type { Prisma } from '@zemmz/db';

export const AUDIENCES = {
  all: 'Everyone registered',
  checked_in: 'Checked in',
  not_checked_in: 'Not checked in yet',
  in_session_now: 'In a session right now',
} as const;

export type Audience = keyof typeof AUDIENCES;

export function audienceWhere(eventId: string, audience: Audience): Prisma.RegistrationWhereInput {
  const base = { eventId, status: 'CONFIRMED' as const };
  switch (audience) {
    case 'checked_in':
      return { ...base, attendance: { some: {} } };
    case 'not_checked_in':
      return { ...base, attendance: { none: {} } };
    case 'in_session_now':
      return { ...base, attendance: { some: { outAt: null, session: { status: 'LIVE' } } } };
    default:
      return base;
  }
}
