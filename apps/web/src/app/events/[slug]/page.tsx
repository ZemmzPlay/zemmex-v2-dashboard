import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@zemmz/db';
import { dayKey, eventType, formatDateRange, formatMoney, formatTime, shortTitle } from '@zemmz/shared';
import { can, requireEvent } from '@/lib/auth';
import { breakdownByField1, eventStats, registrationsByDay, sessionsWithCounts } from '@/lib/stats';
import { fmt, pct, plural, relativeTime } from '@/lib/format';
import { SessionBadge } from '@/components/status';
import { Icon } from '@/components/icon';
import { QuickSettings } from './quick-settings';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { event } = await requireEvent((await params).slug);
  return { title: `Dashboard · ${event.name}` };
}

export default async function EventDashboard({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, event } = await requireEvent(slug);
  if (!can.seeDashboard(user.role)) redirect(`/events/${slug}/check-in`);
  const TY = eventType(event.type);

  const [stats, byDay, breakdown, sessions, paid, activity] = await Promise.all([
    eventStats(event),
    registrationsByDay(event),
    breakdownByField1(event),
    sessionsWithCounts(event.id),
    prisma.ticketType.count({ where: { eventId: event.id, priceMinor: { gt: 0 } } }),
    prisma.activityLog.findMany({ where: { eventId: event.id }, orderBy: { createdAt: 'desc' }, take: 5 }),
  ]);

  const today = dayKey(new Date(), event.timezone);
  const todays = sessions.filter((s) => dayKey(s.startsAt, event.timezone) === today);
  const shown = todays.length ? todays : sessions.filter((s) => s.status !== 'ENDED').slice(0, 5);
  const anyLive = sessions.some((s) => s.status === 'LIVE');
  const maxDay = Math.max(1, ...byDay.map((d) => d.n));
  const maxBreak = Math.max(1, ...breakdown.map((b) => b.n));
  const delta = stats.last24h - stats.prev24h;

  return (
    <>
      <div className="ph">
        <div>
          <h1>{event.name}</h1>
          <p>{TY.label} · {formatDateRange(event.startsOn, event.endsOn, 'UTC')} · {event.venueName}</p>
        </div>
        <div className="actions">
          <Link href={`/events/${slug}/registrations/new`} className="btn secondary"><Icon name="plus" size={16} /> {TY.register}</Link>
          <Link href={`/events/${slug}/check-in`} className="btn primary"><Icon name="scan" size={16} /> Open check-in</Link>
        </div>
      </div>

      <section data-tour="kpis" aria-label="Key figures" className="mb-4 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <div className="card kpi hero">
          <div className="l">{TY.openForm === 'Tickets' ? 'Tickets sold' : TY.regs}</div>
          <div className="v !text-[40px]">{fmt(stats.total)}</div>
          <div className="d">
            <span className="delta up">+{fmt(stats.last24h)}</span> in the last 24 hours
            {' · '}{delta === 0 ? 'same as' : `${fmt(Math.abs(delta))} ${delta > 0 ? 'more' : 'fewer'} than`} the day before
          </div>
        </div>
        {paid > 0 && (
          <div className="card kpi">
            <div className="l">Revenue</div>
            <div className="v">{formatMoney(stats.revenueMinor, event.currency)}</div>
            <div className="d">Paid orders, before the platform fee</div>
          </div>
        )}
        <div className="card kpi">
          <div className="l">Checked in</div>
          <div className="v">{fmt(stats.checkedIn)}</div>
          <div className="d">{pct(stats.checkedIn, stats.total)}% of {TY.guests}</div>
        </div>
        <div className="card kpi">
          <div className="l">{anyLive ? TY.roomLbl : TY.cert === 'none' ? 'After-event page views' : 'Certificates issued'}</div>
          <div className="v">{fmt(anyLive ? stats.inRoom : TY.cert === 'none' ? stats.afterViews : stats.certificates)}</div>
          <div className="d">{anyLive ? plural(sessions.filter((s) => s.status === 'LIVE').length, `live ${TY.unit.toLowerCase()}`) : TY.cert === 'none' ? 'Since the page went live' : `To ${TY.guests} who attended`}</div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-12">
        <section data-tour="quick" className="card lg:col-span-7" aria-labelledby="qs-h">
          <div className="card-h"><h2 id="qs-h">Quick settings</h2><span className="sub">What your homepage shows</span></div>
          <div className="card-b">
            <QuickSettings
              slug={slug}
              colour={event.accentColour}
              canEdit={can.manageEvent(user.role)}
              initial={{ registrationOpen: event.registrationOpen, afterEventOn: event.afterEventOn, maintenance: event.maintenance }}
              labels={{ openLbl: TY.openLbl, openDesc: TY.openDesc, openForm: TY.openForm, afterLbl: TY.afterLbl, afterDesc: TY.afterDesc, afterForm: TY.afterForm, certNone: TY.cert === 'none' }}
            />
          </div>
        </section>

        <section data-tour="today" className="card lg:col-span-5" aria-labelledby="today-h">
          <div className="card-h">
            <h2 id="today-h">{todays.length ? `Today’s ${TY.units}` : `Next ${TY.units}`}</h2>
            <span className="r"><Link href={`/events/${slug}/check-in`} className="text-[12.5px] font-semibold no-underline">See all</Link></span>
          </div>
          <div className="card-b">
            {shown.length === 0 ? (
              <p className="m-0 text-muted">No {TY.units} left. The event has ended.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {shown.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
                    <span className="w-[92px] shrink-0 text-[12.5px] tabular-nums text-muted">{formatTime(s.startsAt, event.timezone)}–{formatTime(s.endsAt, event.timezone)}</span>
                    <Link href={`/events/${slug}/check-in/${s.id}`} className="rowlink min-w-0 flex-1 truncate">{shortTitle(s.title)}</Link>
                    <span className="text-[12.5px] tabular-nums text-muted">{s.status === 'LIVE' ? `${fmt(s.inRoom)} in` : s.checkedIn ? fmt(s.checkedIn) : ''}</span>
                    <SessionBadge status={s.status} gates={TY.gates} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section data-tour="chart" className="card lg:col-span-7" aria-labelledby="chart-h">
          <div className="card-h"><h2 id="chart-h">{TY.openForm === 'Tickets' ? 'Ticket sales' : TY.regs}, last 14 days</h2><span className="sub">Per day, {event.timezone.replace('_', ' ')}</span></div>
          <div className="card-b">
            <div className="flex h-[140px] items-end gap-1.5" role="img" aria-label={`Daily ${TY.regs.toLowerCase()}: ${byDay.map((d) => d.n).join(', ')}`}>
              {byDay.map((d) => (
                <div key={d.day} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${d.day}: ${d.n}`}>
                  <span className="text-[10.5px] tabular-nums text-muted">{d.n || ''}</span>
                  <i className="block w-full rounded-t-[4px]" style={{ height: `${Math.max(2, (d.n / maxDay) * 110)}px`, background: d.day === today ? 'var(--brand)' : 'color-mix(in srgb, var(--brand) 45%, var(--neutral-soft))' }} />
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-muted"><span>{byDay[0]?.day.slice(5)}</span><span>Today</span></div>
          </div>
        </section>

        <section className="card lg:col-span-5" aria-labelledby="bd-h">
          <div className="card-h"><h2 id="bd-h">By {TY.f1.toLowerCase()}</h2></div>
          <div className="card-b">
            {breakdown.length === 0 ? <p className="m-0 text-muted">Nothing to show yet.</p> : (
              <div className="hbar">
                {breakdown.map((b) => (
                  <div className="r" key={b.label}>
                    <span className="truncate">{b.label}</span>
                    <span className="t"><i style={{ width: `${(b.n / maxBreak) * 100}%` }} /></span>
                    <span className="n">{fmt(b.n)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="card lg:col-span-12" aria-labelledby="act-h">
          <div className="card-h"><h2 id="act-h">Recent activity</h2><span className="r"><Link href={`/events/${slug}/settings`} className="text-[12.5px] font-semibold no-underline">Activity log</Link></span></div>
          <div className="card-b">
            <ul className="m-0 list-none p-0">
              {activity.map((a) => (
                <li key={a.id} className="flex gap-3 border-b border-line py-2 text-[13.5px] last:border-0">
                  <b className="font-semibold">{a.actorLabel}</b>
                  <span className="text-ink-2">{a.action}</span>
                  <time className="ml-auto whitespace-nowrap text-[12px] text-muted" dateTime={a.createdAt.toISOString()}>{relativeTime(a.createdAt)}</time>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </>
  );
}
