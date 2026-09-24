import Link from 'next/link';
import { prisma } from '@zemmz/db';
import { dayKey, eventType, formatDateRange, formatDay, formatTime, sanitizeRichText, shortTitle, lowerFirst } from '@zemmz/shared';
import { getPublicEvent, getPublicPages, homeState } from '@/lib/public-event';
import { loadFormFields } from '@/lib/form-fields';
import { initials } from '@/lib/format';
import { claim, registerFree } from '../actions';
import { ClaimPanel, FreeRegistration, TicketPicker } from './panels';

export default async function EventHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getPublicEvent(slug);
  const TY = eventType(event.type);
  const state = homeState(event);
  const base = `/e/${slug}`;

  const [pages, people, sessions, tickets] = await Promise.all([
    getPublicPages(event.id),
    prisma.person.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: 'asc' }, take: 6, include: { photo: { select: { key: true } } } }),
    prisma.session.findMany({ where: { eventId: event.id }, orderBy: [{ startsAt: 'asc' }, { sortOrder: 'asc' }] }),
    prisma.ticketType.findMany({ where: { eventId: event.id, onSale: true }, orderBy: { sortOrder: 'asc' }, include: { _count: { select: { registrations: { where: { status: 'CONFIRMED' } } } } } }),
  ]);
  const paid = tickets.some((t) => t.priceMinor > 0);
  const welcome = pages[0];
  const days = [...new Set(sessions.map((s) => dayKey(s.startsAt, event.timezone)))];

  let panel: React.ReactNode;
  if (state === 'after') {
    const cert = TY.cert !== 'none';
    panel = (
      <ClaimPanel
        action={claim.bind(null, slug)}
        labels={{
          title: cert ? (TY.credits ? 'Your certificate and CME points' : 'Your certificate') : TY.gates ? 'Photos and the survey' : 'Recordings and slides',
          sub: cert ? `Enter your ${lowerFirst(TY.idName)} and email to download your certificate.` : `Enter your ${lowerFirst(TY.idName)} and email to open the ${TY.afterLbl.toLowerCase()}.`,
          idName: TY.idName,
          badge: TY.badge,
          cta: cert ? 'Get my certificate' : `Open the ${TY.afterLbl.toLowerCase()}`,
        }}
      />
    );
  } else if (state === 'open' && tickets.length === 0) {
    panel = <div className="panel"><h2>{TY.openForm === 'Tickets' ? 'Tickets' : 'Registration'}</h2><p className="sub">Nothing is on sale right now. Check back soon.</p></div>;
  } else if (state === 'open' && paid) {
    panel = (
      <TicketPicker
        slug={slug}
        currency={event.currency}
        title={TY.openForm === 'Tickets' ? 'Get tickets' : 'Register'}
        tickets={tickets.map((t) => ({ id: t.id, name: t.name, description: t.description, priceMinor: t.priceMinor, left: t.capacity == null ? null : Math.max(0, t.capacity - t._count.registrations) }))}
      />
    );
  } else if (state === 'open') {
    const form = await loadFormFields(event.id, event.currency);
    panel = (
      <FreeRegistration
        action={registerFree.bind(null, slug)}
        fields={form.fields}
        tickets={tickets.map((t) => ({ id: t.id, label: t.name }))}
        labels={{ title: 'Register', sub: `Free. You’ll get your ${lowerFirst(TY.idName)} by email.`, cta: 'Register' }}
      />
    );
  } else {
    panel = <div className="panel"><h2>{TY.openForm === 'Tickets' ? 'Ticket sales are closed' : 'Registration is closed'}</h2><p className="sub">If you’ve already registered, your confirmation email has everything you need.</p></div>;
  }

  return (
    <>
      <section className="hero" aria-labelledby="ev-name">
        <div className="wrap">
          <div>
            <p className="ed">{TY.label}{event.organiserName && ` · ${event.organiserName}`}</p>
            <h1 id="ev-name">{event.name}</h1>
            {event.heroText && <p className="lede">{event.heroText}</p>}
            <div className="when">
              <span>{formatDateRange(event.startsOn, event.endsOn, 'UTC')}</span>
              {event.venueName && <span>{event.venueName}</span>}
            </div>
          </div>
          {panel}
        </div>
      </section>

      {welcome && (
        <section className="sec">
          <div className="wrap grid gap-12 lg:grid-cols-[1.25fr_1fr]">
            <div className="prose border-l-4 pl-7" style={{ borderColor: 'var(--accent)' }} dangerouslySetInnerHTML={{ __html: sanitizeRichText(welcome.bodyHtml) }} />
            {people.length > 0 && (
              <div>
                <p className="kick">{TY.people.toUpperCase()}</p>
                <div className={`people shape-${TY.shape}`} style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
                  {people.slice(0, 6).map((p) => (
                    <div className="person" key={p.id}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <div className="av" aria-hidden="true">{p.photo ? <img src={`/files/${p.photo.key}`} alt="" /> : initials(p.name)}</div>
                      <b>{p.name}</b>
                      <small>{p.setTime || `${p.category}${TY.catSfx}`}</small>
                    </div>
                  ))}
                </div>
                <Link href={`${base}/people`} className="btn line sm mt-6">All {TY.people.toLowerCase()}</Link>
              </div>
            )}
          </div>
        </section>
      )}

      {sessions.length > 0 && (
        <section className="sec strip">
          <div className="wrap">
            <p className="kick">{TY.gates ? 'THE NIGHT' : 'PROGRAMME'}</p>
            <h2 className="sec-t">{TY.gates ? 'Doors and gates' : `${days.length} ${days.length === 1 ? 'day' : 'days'}, ${sessions.length} ${TY.units}`}</h2>
            <ol className="agenda m-0 list-none p-0">
              {sessions.slice(0, 6).map((s) => (
                <li key={s.id}>
                  <time>{days.length > 1 && <span className="block text-[12px] font-medium text-[var(--muted)]">{formatDay(s.startsAt, event.timezone)}</span>}{formatTime(s.startsAt, event.timezone)}</time>
                  <div>
                    <h3>{TY.gates ? s.title : shortTitle(s.title) === s.title ? s.title : s.title.split(':').slice(1).join(':').trim()}</h3>
                    <small>{TY.gates ? s.location : [shortTitle(s.title) !== s.title && shortTitle(s.title), s.chairs, s.location].filter(Boolean).join(' · ')}</small>
                  </div>
                  {s.status === 'LIVE' ? <span className="pill">{TY.gates ? 'Open now' : 'On now'}</span> : s.capacity && !TY.gates ? <span className="pill low">{s.capacity} seats</span> : <span />}
                </li>
              ))}
            </ol>
            <Link href={`${base}/programme`} className="btn line sm mt-6">Full {TY.gates ? 'set times' : 'programme'}</Link>
          </div>
        </section>
      )}
    </>
  );
}
