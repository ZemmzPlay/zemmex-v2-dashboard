import 'server-only';
import { prisma } from '@zemmz/db';

export type EventPhase = 'upcoming' | 'live' | 'ended';

/** Where an event is in its life, from its sessions (kept current by the worker). */
export async function eventPhases(eventIds: string[]): Promise<Map<string, EventPhase>> {
  const rows = await prisma.session.groupBy({ by: ['eventId', 'status'], where: { eventId: { in: eventIds } }, _count: { _all: true } });
  const out = new Map<string, EventPhase>();
  for (const id of eventIds) {
    const mine = rows.filter((r) => r.eventId === id);
    const n = (s: string) => mine.find((r) => r.status === s)?._count._all ?? 0;
    out.set(id, n('LIVE') > 0 ? 'live' : n('UPCOMING') === 0 && n('ENDED') > 0 ? 'ended' : n('ENDED') > 0 ? 'live' : 'upcoming');
  }
  return out;
}
