import type { Metadata } from 'next';
import { prisma } from '@zemmz/db';
import { dayKey, eventType, formatDay, formatTime } from '@zemmz/shared';
import { getPublicEvent } from '@/lib/public-event';

export const metadata: Metadata = { title: 'Programme' };

export default async function ProgrammePage({ params }: { params: Promise<{ slug: string }> }) {
  const event = await getPublicEvent((await params).slug);
  const TY = eventType(event.type);
  const tz = event.timezone;

  if (TY.gates) {
    const [acts, gates] = await Promise.all([
      prisma.person.findMany({ where: { eventId: event.id }, orderBy: { setTime: 'asc' } }),
      prisma.session.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: 'asc' }, include: { gateTicketType: true } }),
    ]);
    return (
      <div className="wrap pb-20">
        <div className="page-h"><h1>Set times</h1><p className="sec-p">Times are {tz.replace('_', ' ')}. Doors open {gates[0] ? formatTime(gates[0].startsAt, tz) : ''}.</p></div>
        <ol className="agenda m-0 mb-14 list-none p-0">
          {acts.map((a) => (
            <li key={a.id}><time>{a.setTime || 'TBC'}</time><div><h3>{a.name}</h3><small>{a.category}</small></div><span /></li>
          ))}
        </ol>
        <h2 className="sec-t">Gates</h2>
        <p className="sec-p">Your e-ticket works only at the gate for your ticket type. Pass-outs are allowed: scan out and back in.</p>
        <ol className="agenda m-0 list-none p-0">
          {gates.map((g) => (
            <li key={g.id}><time>{formatTime(g.startsAt, tz)}</time><div><h3>{g.title}</h3><small>{g.location}{g.gateTicketType && ` · ${g.gateTicketType.name} tickets`}</small></div><span /></li>
          ))}
        </ol>
      </div>
    );
  }

  const sessions = await prisma.session.findMany({ where: { eventId: event.id }, orderBy: [{ startsAt: 'asc' }, { sortOrder: 'asc' }] });
  const days = new Map<string, typeof sessions>();
  for (const s of sessions) days.set(dayKey(s.startsAt, tz), [...(days.get(dayKey(s.startsAt, tz)) ?? []), s]);

  return (
    <div className="wrap pb-20">
      <div className="page-h">
        <h1>{TY.credits ? 'Sessions' : 'Agenda'}</h1>
        <p className="sec-p">
          Times are {tz.replace('_', ' ')}.{TY.credits && ` Scan in and out at the door of each session: CME points depend on time in the room.`}
        </p>
      </div>
      {sessions.length === 0 && <p className="text-[var(--muted)]">The programme will be published soon.</p>}
      {[...days.values()].map((list) => (
        <section key={list[0].id} className="mb-12">
          <h2 className="mb-2 text-[22px] font-bold" style={{ fontFamily: 'var(--serif)' }}>{formatDay(list[0].startsAt, tz)}</h2>
          <ol className="agenda m-0 list-none p-0">
            {list.map((s) => (
              <li key={s.id}>
                <time>{formatTime(s.startsAt, tz)}–{formatTime(s.endsAt, tz)}</time>
                <div>
                  <h3>{s.title}</h3>
                  <small>{[s.chairs && `${TY.chair}: ${s.chairs}`, s.location, TY.credits && s.credits ? `${s.credits} CME points` : ''].filter(Boolean).join(' · ')}</small>
                </div>
                {s.status === 'LIVE' ? <span className="pill">On now</span> : s.capacity ? <span className="pill low">{s.capacity} seats</span> : <span />}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
