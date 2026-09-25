import Link from 'next/link';
import { prisma } from '@zemmz/db';
import { dayKey, eventType, localiseAll, formatDateRange, formatDay, formatTime, sanitizeRichText, shortTitle } from '@zemmz/shared';
import { siteTextFor } from '@/lib/site-locale';
import { getPublicEvent, getPublicPages, homeState } from '@/lib/public-event';
import { loadFormFields } from '@/lib/form-fields';
import { initials } from '@/lib/format';
import { claim, registerFree } from '../actions';
import { ClaimPanel, FreeRegistration, TicketPicker } from './panels';

export default async function EventHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getPublicEvent(slug);
  const TY = eventType(event.type);
  const { t, locale } = await siteTextFor(event);
  const state = homeState(event);
  const base = `/e/${slug}`;

  const [pages, people, sessions, tickets] = await Promise.all([
    getPublicPages(event.id).then((r) => localiseAll(r, locale)),
    prisma.person.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: 'asc' }, take: 6, include: { photo: { select: { key: true } } } }).then((r) => localiseAll(r, locale)),
    prisma.session.findMany({ where: { eventId: event.id }, orderBy: [{ startsAt: 'asc' }, { sortOrder: 'asc' }] }).then((r) => localiseAll(r, locale)),
    prisma.ticketType.findMany({ where: { eventId: event.id, onSale: true }, orderBy: { sortOrder: 'asc' }, include: { _count: { select: { registrations: { where: { status: { in: ['CONFIRMED', 'PENDING'] } } } } } } }).then((r) => localiseAll(r, locale)),
  ]);
  const paid = tickets.some((t) => t.priceMinor > 0);
  const welcome = pages[0];
  const days = [...new Set(sessions.map((s) => dayKey(s.startsAt, event.timezone)))];

  let panel: React.ReactNode;
  if (state === 'after') {
    panel = <ClaimPanel action={claim.bind(null, slug)} type={event.type} locale={locale} />;
  } else if (state === 'open' && tickets.length === 0) {
    panel = <div className="panel"><h2>{t.ticketsHeading}</h2><p className="sub">{t.nothingOnSale}</p></div>;
  } else if (state === 'open' && paid) {
    panel = (
      <TicketPicker
        slug={slug}
        currency={event.currency}
        type={event.type}
        locale={locale}
        tickets={tickets.map((x) => ({ id: x.id, name: x.name, description: x.description, priceMinor: x.priceMinor, left: x.capacity == null ? null : Math.max(0, x.capacity - x._count.registrations) }))}
      />
    );
  } else if (state === 'open') {
    const form = await loadFormFields(event.id, event.currency, { locale });
    panel = (
      <FreeRegistration
        action={registerFree.bind(null, slug)}
        fields={form.fields.map((f) => ({ ...f, label: t.term(f.label), options: f.options }))}
        tickets={tickets.map((x) => ({ id: x.id, label: x.name }))}
        type={event.type}
        locale={locale}
      />
    );
  } else {
    panel = <div className="panel"><h2>{t.closed}</h2><p className="sub">{t.closedSub}</p></div>;
  }

  return (
    <>
      <section className="hero" aria-labelledby="ev-name">
        <div className="wrap">
          <div>
            <p className="ed">{t.v.label}{event.organiserName && ` · ${event.organiserName}`}</p>
            <h1 id="ev-name">{event.name}</h1>
            {event.heroText && <p className="lede">{event.heroText}</p>}
            <div className="when">
              <span>{formatDateRange(event.startsOn, event.endsOn, 'UTC', locale)}</span>
              {event.venueName && <span>{event.venueName}</span>}
            </div>
          </div>
          {panel}
        </div>
      </section>

      {welcome && (
        <section className="sec">
          <div className="wrap grid gap-12 lg:grid-cols-[1.25fr_1fr]">
            <div className="prose border-s-4 ps-7" style={{ borderColor: 'var(--accent)' }} dangerouslySetInnerHTML={{ __html: sanitizeRichText(welcome.bodyHtml) }} />
            {people.length > 0 && (
              <div>
                <p className="kick">{t.kickPeople}</p>
                <div className={`people shape-${TY.shape}`} style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
                  {people.slice(0, 6).map((p) => (
                    <div className="person" key={p.id}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <div className="av" aria-hidden="true">{p.photo ? <img src={`/files/${p.photo.key}`} alt="" /> : initials(p.name)}</div>
                      <b>{p.name}</b>
                      <small>{p.setTime || t.catHeading(p.category)}</small>
                    </div>
                  ))}
                </div>
                <Link href={`${base}/people`} className="btn line sm mt-6">{t.allPeople}</Link>
              </div>
            )}
          </div>
        </section>
      )}

      {sessions.length > 0 && (
        <section className="sec strip">
          <div className="wrap">
            <p className="kick">{t.kickProgramme}</p>
            <h2 className="sec-t">{t.programmeTitle(days.length, sessions.length)}</h2>
            <ol className="agenda m-0 list-none p-0">
              {sessions.slice(0, 6).map((s) => (
                <li key={s.id}>
                  <time>{days.length > 1 && <span className="block text-[12px] font-medium text-[var(--muted)]">{formatDay(s.startsAt, event.timezone, locale)}</span>}{formatTime(s.startsAt, event.timezone, locale)}</time>
                  <div>
                    <h3>{TY.gates ? s.title : shortTitle(s.title) === s.title ? s.title : s.title.split(':').slice(1).join(':').trim()}</h3>
                    <small>{TY.gates ? s.location : [shortTitle(s.title) !== s.title && shortTitle(s.title), s.chairs, s.location].filter(Boolean).join(' · ')}</small>
                  </div>
                  {s.status === 'LIVE' ? <span className="pill">{t.onNow}</span> : s.capacity && !TY.gates ? <span className="pill low">{t.seats(s.capacity)}</span> : <span />}
                </li>
              ))}
            </ol>
            <Link href={`${base}/programme`} className="btn line sm mt-6">{t.fullProgramme}</Link>
          </div>
        </section>
      )}
    </>
  );
}
