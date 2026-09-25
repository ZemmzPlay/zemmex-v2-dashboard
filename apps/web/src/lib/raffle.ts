import 'server-only';
import type { Prisma } from '@zemmz/db';

/** Who is in a draw: 'in' (checked in anywhere), 'all', or a session or gate ID. */
export function poolWhere(eventId: string, pool: string, excludeWinners: boolean): Prisma.RegistrationWhereInput {
  return {
    eventId,
    status: 'CONFIRMED',
    ...(pool === 'all' ? {} : pool === 'in' ? { attendance: { some: {} } } : { attendance: { some: { sessionId: pool } } }),
    ...(excludeWinners ? { raffleWins: { none: {} } } : {}),
  };
}
