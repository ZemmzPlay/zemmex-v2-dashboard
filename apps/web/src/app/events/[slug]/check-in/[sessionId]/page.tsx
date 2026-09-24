import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@zemmz/db';
import { eventType, formatTime, shortTitle } from '@zemmz/shared';
import { can, requirePermission } from '@/lib/auth';
import { recentScans } from '@/lib/checkin';
import { Icon } from '@/components/icon';
import { SessionBadge } from '@/components/status';
import { Console } from './console';

export const metadata: Metadata = { title: 'Check-in console' };

export default async function ConsolePage({ params }: { params: Promise<{ slug: string; sessionId: string }> }) {
  const { slug, sessionId } = await params;
  const { event } = await requirePermission(slug, can.checkIn);
  const TY = eventType(event.type);
  const session = await prisma.session.findFirst({ where: { id: sessionId, eventId: event.id }, include: { gateTicketType: true } });
  if (!session) notFound();

  const [inRoom, checkedIn, feed, others] = await Promise.all([
    prisma.attendance.count({ where: { sessionId, outAt: null } }),
    prisma.attendance.groupBy({ by: ['registrationId'], where: { sessionId } }).then((r) => r.length),
    recentScans(event, sessionId),
    prisma.session.findMany({ where: { eventId: event.id, status: 'LIVE', id: { not: sessionId } }, select: { id: true, title: true } }),
  ]);

  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href={`/events/${slug}/check-in`}>{TY.ckNav}</Link> <Icon name="chevr" size={12} /> <span>{shortTitle(session.title)}</span>
      </nav>
      <div className="ph">
        <div>
          <h1 className="flex flex-wrap items-center gap-3">{session.title} <SessionBadge status={session.status} gates={TY.gates} /></h1>
          <p>
            {formatTime(session.startsAt, event.timezone)}–{formatTime(session.endsAt, event.timezone)}
            {session.location && ` · ${session.location}`}
            {TY.gates && session.gateTicketType && ` · accepts ${session.gateTicketType.name} only`}
            {session.capacity ? ` · ${session.capacity} places` : ''}
            {TY.credits && session.credits ? ` · ${session.credits} CME points` : ''}
          </p>
        </div>
        {others.length > 0 && (
          <div className="actions">
            {others.slice(0, 3).map((o) => (
              <Link key={o.id} href={`/events/${slug}/check-in/${o.id}`} className="btn secondary sm">Switch to {shortTitle(o.title)}</Link>
            ))}
          </div>
        )}
      </div>
      <Console
        endpoint={`/events/${slug}/check-in/${sessionId}/scan`}
        labels={{ inLbl: TY.inLbl, outLbl: TY.outLbl, roomLbl: TY.roomLbl, badge: TY.badge, gates: TY.gates, checkedInLbl: TY.gates ? 'Came in tonight' : 'Checked in so far' }}
        capacity={session.capacity}
        ended={session.status === 'ENDED'}
        initial={{ inRoom, checkedIn, feed }}
        demoTools={process.env.NODE_ENV !== 'production'}
      />
    </>
  );
}
