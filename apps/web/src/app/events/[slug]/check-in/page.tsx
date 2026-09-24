import type { Metadata } from 'next';
import Link from 'next/link';
import { dayKey, eventType, formatDay, formatTime, shortTitle } from '@zemmz/shared';
import { can, requirePermission } from '@/lib/auth';
import { sessionsWithCounts } from '@/lib/stats';
import { fmt } from '@/lib/format';
import { SessionBadge } from '@/components/status';
import { Icon } from '@/components/icon';

export const metadata: Metadata = { title: 'Check-in' };

export default async function CheckInList({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { event } = await requirePermission(slug, can.checkIn);
  const TY = eventType(event.type);
  const sessions = await sessionsWithCounts(event.id);
  const days = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const k = dayKey(s.startsAt, event.timezone);
    days.set(k, [...(days.get(k) ?? []), s]);
  }
  const live = sessions.filter((s) => s.status === 'LIVE');

  return (
    <>
      <div className="ph">
        <div>
          <h1>{TY.ckNav}</h1>
          <p>Open a {TY.unit.toLowerCase()} to scan {TY.gates ? 'e-tickets' : 'badges'}. Times are {event.timezone.replace('_', ' ')}.</p>
        </div>
        {live[0] && (
          <div className="actions">
            <Link href={`/events/${slug}/check-in/${live[0].id}`} className="btn primary"><Icon name="scan" size={16} /> Scan at {shortTitle(live[0].title)}</Link>
          </div>
        )}
      </div>

      {sessions.length === 0 && (
        <div className="card empty">
          <div className="ic"><Icon name="cal" size={24} /></div>
          <h3>No {TY.units} yet</h3>
          <p>Add {TY.units} to the programme, then scan people in and out of each one.</p>
        </div>
      )}

      {[...days.entries()].map(([day, list]) => (
        <section key={day} className="mb-6" aria-labelledby={`d-${day}`}>
          <h2 id={`d-${day}`} className="mb-3 text-[15px] font-semibold">{formatDay(list[0].startsAt, event.timezone)}</h2>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">{TY.unit}</th>
                  <th scope="col">{TY.gates ? 'Accepts' : 'Where'}</th>
                  <th scope="col" className="num">{TY.gates ? 'Came in' : 'Checked in'}</th>
                  <th scope="col" className="num">{TY.roomLbl}</th>
                  {TY.credits && <th scope="col" className="num">CME</th>}
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id}>
                    <td className="whitespace-nowrap tabular-nums">{formatTime(s.startsAt, event.timezone)}–{formatTime(s.endsAt, event.timezone)}</td>
                    <td>
                      <Link href={`/events/${slug}/check-in/${s.id}`} className="rowlink">{s.title}</Link>
                      {s.chairs && <div className="muted">{TY.chair}: {s.chairs}</div>}
                    </td>
                    <td className="muted">{TY.gates ? s.gateTicketType?.name ?? 'Any ticket' : s.location}</td>
                    <td className="num">{fmt(s.checkedIn)}{s.capacity ? <span className="muted"> / {fmt(s.capacity)}</span> : ''}</td>
                    <td className="num">{s.status === 'LIVE' ? fmt(s.inRoom) : '—'}</td>
                    {TY.credits && <td className="num">{s.credits || '—'}</td>}
                    <td><SessionBadge status={s.status} gates={TY.gates} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}
