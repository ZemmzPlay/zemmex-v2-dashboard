import 'server-only';
import { prisma, type Event } from '@zemmz/db';
import { eventType } from '@zemmz/shared';
import { helpData, tourSteps, type TourId } from '@/lib/help';

/** Help for this event: its words, and tours that open its own pages. */
export async function helpFor(event: Event) {
  const TY = eventType(event.type);
  const [paid, session] = await Promise.all([
    prisma.ticketType.count({ where: { eventId: event.id, priceMinor: { gt: 0 } } }).then((n) => n > 0),
    prisma.session.findFirst({ where: { eventId: event.id }, orderBy: [{ status: 'asc' }, { startsAt: 'asc' }] }),
  ]);
  const base = `/events/${event.slug}`;
  const live = await prisma.session.findFirst({ where: { eventId: event.id, status: 'LIVE' } });
  const consolePath = live ? `${base}/check-in/${live.id}` : session ? `${base}/check-in/${session.id}` : null;
  return {
    TY,
    categories: helpData(TY, paid),
    tour: (id: TourId) => tourSteps(id, TY, base, consolePath, paid),
  };
}
