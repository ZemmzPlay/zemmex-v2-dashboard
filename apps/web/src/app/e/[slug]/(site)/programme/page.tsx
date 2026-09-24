import type { Metadata } from 'next';
import { prisma } from '@zemmz/db';
import { dayKey, eventType, formatDay, formatTime } from '@zemmz/shared';
import { getPublicEvent } from '@/lib/public-event';
import { siteTextFor } from '@/lib/site-locale';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return { title: (await siteTextFor(await getPublicEvent((await params).slug))).t.programmeNav };
}

export default async function ProgrammePage({ params }: { params: Promise<{ slug: string }> }) {
  const event = await getPublicEvent((await params).slug);
  const TY = eventType(event.type);
  const { t, locale } = await siteTextFor(event);
  const tz = event.timezone;

  if (TY.gates) {
    const [acts, gates] = await Promise.all([
      prisma.person.findMany({ where: { eventId: event.id }, orderBy: { setTime: 'asc' } }),
      prisma.session.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: 'asc' }, include: { gateTicketType: true } }),
    ]);
    return (
      <div className="wrap pb-20">
        <div className="page-h"><h1>{t.setTimes}</h1><p className="sec-p">{t.timesAre(tz)}{gates[0] ? t.doorsOpen(formatTime(gates[0].startsAt, tz, locale)) : ''}</p></div>
        <ol className="agenda m-0 mb-14 list-none p-0">
          {acts.map((a) => (
            <li key={a.id}><time>{a.setTime || t.tbc}</time><div><h3>{a.name}</h3><small>{t.catHeading(a.category)}</small></div><span /></li>
          ))}
        </ol>
        <h2 className="sec-t">{t.gates}</h2>
        <p className="sec-p">{t.gatesSub(event.allowPassOut)}</p>
        <ol className="agenda m-0 list-none p-0">
          {gates.map((g) => (
            <li key={g.id}><time>{formatTime(g.startsAt, tz, locale)}</time><div><h3>{g.title}</h3><small>{[g.location, g.gateTicketType && t.ticketsOf(g.gateTicketType.name)].filter(Boolean).join(' · ')}</small></div><span /></li>
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
        <h1>{t.programmeTitlePage}</h1>
        <p className="sec-p">
          {t.timesAre(tz)}{TY.credits && t.cmeNote}
        </p>
      </div>
      {sessions.length === 0 && <p className="text-[var(--muted)]">{t.comingSoon}</p>}
      {[...days.values()].map((list) => (
        <section key={list[0].id} className="mb-12">
          <h2 className="mb-2 text-[22px] font-bold" style={{ fontFamily: 'var(--serif)' }}>{formatDay(list[0].startsAt, tz, locale)}</h2>
          <ol className="agenda m-0 list-none p-0">
            {list.map((s) => (
              <li key={s.id}>
                <time className="ltr">{formatTime(s.startsAt, tz, locale)}–{formatTime(s.endsAt, tz, locale)}</time>
                <div>
                  <h3>{s.title}</h3>
                  <small>{[s.chairs && `${t.v.chair}: ${s.chairs}`, s.location, TY.credits && s.credits ? t.cmePoints(s.credits) : ''].filter(Boolean).join(' · ')}</small>
                </div>
                {s.status === 'LIVE' ? <span className="pill">{t.onNow}</span> : s.capacity ? <span className="pill low">{t.seats(s.capacity)}</span> : <span />}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
