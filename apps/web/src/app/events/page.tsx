import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@zemmz/db';
import { eventType, formatDateRange } from '@zemmz/shared';
import { can, requireUser } from '@/lib/auth';
import { eventPhases } from '@/lib/events';
import { fmt } from '@/lib/format';
import { DashboardShell } from '@/components/shell/dashboard-shell';
import { EventStateBadge } from '@/components/status';
import { Icon } from '@/components/icon';

export const metadata: Metadata = { title: 'All events' };

export default async function EventsPage() {
  const user = await requireUser();
  const events = await prisma.event.findMany({
    where: { organisationId: user.organisationId, archivedAt: null },
    orderBy: { startsOn: 'desc' },
    include: { _count: { select: { registrations: { where: { status: 'CONFIRMED' } } } } },
  });
  if (user.role === 'CHECKIN' && events.length) redirect(`/events/${events[0].slug}/check-in`);
  const phases = await eventPhases(events.map((e) => e.id));

  return (
    <DashboardShell user={user}>
      <div className="ph">
        <div>
          <h1>All events</h1>
          <p>{user.organisationName} · {events.length} {events.length === 1 ? 'event' : 'events'}</p>
        </div>
        {can.manageEvent(user.role) && (
          <div className="actions">
            <Link href="/events/new" className="btn primary">
              <Icon name="plus" size={16} /> New event
            </Link>
          </div>
        )}
      </div>

      {events.length === 0 ? (
        <div className="card empty">
          <div className="ic"><Icon name="cal" size={24} /></div>
          <h3>No events yet</h3>
          <p>Create your first event. You’ll choose its type first, and the dashboard will use that event’s words.</p>
          {can.manageEvent(user.role) && <Link href="/events/new" className="btn primary">New event</Link>}
        </div>
      ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
          {events.map((e) => {
            const t = eventType(e.type);
            const phase = phases.get(e.id)!;
            return (
              <Link key={e.id} href={`/events/${e.slug}`} className="card flex flex-col overflow-hidden text-ink no-underline transition hover:-translate-y-0.5 hover:shadow-[var(--shadow)]">
                <div className="flex items-end justify-between p-4 text-white" style={{ background: e.accentColour, minHeight: 88 }}>
                  <b className="text-xl font-extrabold tracking-[-0.02em]">{e.shortName}</b>
                  <EventStateBadge live={phase === 'live'} ended={phase === 'ended'} maintenance={e.maintenance} />
                </div>
                <div className="flex flex-1 flex-col gap-1 p-4">
                  <b className="text-[15px] font-semibold">{e.name}</b>
                  <span className="text-[12.5px] text-muted">{t.label} · {formatDateRange(e.startsOn, e.endsOn, 'UTC')}</span>
                  <span className="mt-2 text-[13px] text-ink-2">{fmt(e._count.registrations)} {e._count.registrations === 1 ? t.one : t.regs.toLowerCase()}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </DashboardShell>
  );
}
