import type { Metadata } from 'next';
import Link from 'next/link';
import { dayKey, eventType, formatDay, formatTime, shortTitle, wallTime, type EventTypeDef } from '@zemmz/shared';
import { prisma, type Session, type TicketType } from '@zemmz/db';
import { can, requirePermission } from '@/lib/auth';
import { sessionsWithCounts } from '@/lib/stats';
import { fmt } from '@/lib/format';
import { SessionBadge } from '@/components/status';
import { Icon } from '@/components/icon';
import { ConfirmButton } from '@/components/confirm-button';
import { FormDialog } from '@/components/form-dialog';
import { deleteSession, saveSession } from './actions';
import { ArabicInput, arText, isBilingual } from '@/components/arabic-input';

export const metadata: Metadata = { title: 'Check-in' };

export default async function CheckInList({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, event } = await requirePermission(slug, can.checkIn);
  const TY = eventType(event.type);
  const edit = can.editContent(user.role);
  const [sessions, tickets] = await Promise.all([
    sessionsWithCounts(event.id),
    TY.gates ? prisma.ticketType.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: 'asc' } }) : Promise.resolve([] as TicketType[]),
  ]);
  const days: string[] = [];
  for (let t = event.startsOn.getTime(); t <= event.endsOn.getTime(); t += 86_400_000) days.push(dayKey(new Date(t), 'UTC'));
  const fields = (s?: Session) => <SessionFields TY={TY} s={s} tz={event.timezone} days={days} tickets={tickets} bilingual={isBilingual(event)} />;
  const byDay = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const k = dayKey(s.startsAt, event.timezone);
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }
  const live = sessions.filter((s) => s.status === 'LIVE');

  return (
    <>
      <div className="ph">
        <div>
          <h1>{TY.ckNav}</h1>
          <p>Open a {TY.unit.toLowerCase()} to scan {TY.gates ? 'e-tickets' : 'badges'}. Times are {event.timezone.replace('_', ' ')}.</p>
        </div>
        <div className="actions">
          {can.editRegistrations(user.role) && sessions.length > 0 && <a className="btn secondary" href={`/events/${slug}/check-in/export`}><Icon name="download" size={16} /> Export attendance</a>}
          {edit && (
            <FormDialog action={saveSession.bind(null, slug, null)} label={<><Icon name="plus" size={16} /> Add {TY.unit.toLowerCase()}</>} title={`Add ${TY.unit.toLowerCase()}`} submitLabel="Add" wide>
              {fields()}
            </FormDialog>
          )}
          {live[0] && <Link href={`/events/${slug}/check-in/${live[0].id}`} className="btn primary"><Icon name="scan" size={16} /> Scan at {shortTitle(live[0].title)}</Link>}
        </div>
      </div>

      {sessions.length === 0 && (
        <div className="card empty">
          <div className="ic"><Icon name="cal" size={24} /></div>
          <h3>No {TY.units} yet</h3>
          <p>{edit ? `Add ${TY.units} with the button above, then scan people in and out of each one.` : `An organiser adds ${TY.units} before the event.`}</p>
        </div>
      )}

      {[...byDay.entries()].map(([day, list]) => (
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
                  {edit && <th scope="col" className="text-right">Action</th>}
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
                    {edit && (
                      <td className="whitespace-nowrap text-right">
                        <span className="inline-flex gap-2">
                          <FormDialog action={saveSession.bind(null, slug, s.id)} label="Edit" className="btn secondary sm" title={`Edit ${shortTitle(s.title)}`} submitLabel="Save" wide>
                            {fields(s)}
                          </FormDialog>
                          {s.checkedIn === 0 && (
                            <ConfirmButton
                              action={deleteSession.bind(null, slug)}
                              hidden={{ id: s.id }}
                              label="Delete"
                              className="btn danger-ghost sm"
                              title={`Delete ${shortTitle(s.title)}?`}
                              body={`Nobody has been scanned here yet. It disappears from the schedule${TY.gates ? '' : ' and the website'} straight away.`}
                              confirmLabel={`Delete ${TY.unit.toLowerCase()}`}
                            />
                          )}
                        </span>
                      </td>
                    )}
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

function SessionFields({ TY, s, tz, days, tickets, bilingual }: { TY: EventTypeDef; s?: Session; tz: string; days: string[]; tickets: TicketType[]; bilingual: boolean }) {
  const id = (k: string) => `${k}-${s?.id ?? 'new'}`;
  const day = s ? dayKey(s.startsAt, tz) : days[0];
  return (
    <>
      <div className="fld">
        <label htmlFor={id('t')}>Title<span className="req">*</span></label>
        <input id={id('t')} name="title" className="inp" defaultValue={s?.title} required maxLength={160} autoFocus placeholder={TY.gates ? 'For example, Gate C · Accessible entrance' : TY.credits ? 'For example, Session 7: Hypertension update' : 'For example, Workshop: Design systems'} />
      </div>
      <div className="grid gap-x-4 sm:grid-cols-3">
        <div className="fld">
          <label htmlFor={id('d')}>Day</label>
          <select id={id('d')} name="date" className="sel" defaultValue={days.includes(day) ? day : days[0]}>
            {days.map((d) => <option key={d} value={d}>{formatDay(new Date(`${d}T12:00:00Z`), 'UTC')}</option>)}
          </select>
        </div>
        <div className="fld">
          <label htmlFor={id('s')}>{TY.gates ? 'Opens' : 'Starts'}</label>
          <input id={id('s')} name="starts" type="time" className="inp" defaultValue={s ? wallTime(s.startsAt, tz) : '09:00'} required />
        </div>
        <div className="fld">
          <label htmlFor={id('e')}>{TY.gates ? 'Closes' : 'Ends'}</label>
          <input id={id('e')} name="ends" type="time" className="inp" defaultValue={s ? wallTime(s.endsAt, tz) : '10:00'} required />
          {TY.gates && <span className="help">A time before opening means the next morning.</span>}
        </div>
      </div>
      <div className="grid gap-x-4 sm:grid-cols-2">
        {TY.gates ? (
          <div className="fld">
            <label htmlFor={id('g')}>Accepts</label>
            <select id={id('g')} name="gateTicketTypeId" className="sel" defaultValue={s?.gateTicketTypeId ?? ''}>
              <option value="">Any ticket</option>
              {tickets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <span className="help">Other tickets are refused and told which gate to use.</span>
          </div>
        ) : (
          <>
            <div className="fld">
              <label htmlFor={id('c')}>{TY.chair}<span className="opt">optional</span></label>
              <input id={id('c')} name="chairs" className="inp" defaultValue={s?.chairs} maxLength={200} />
            </div>
            <div className="fld">
              <label htmlFor={id('l')}>Room or place<span className="opt">optional</span></label>
              <input id={id('l')} name="location" className="inp" defaultValue={s?.location} maxLength={120} />
            </div>
          </>
        )}
      </div>
      <div className="grid gap-x-4 sm:grid-cols-2">
        {TY.credits && (
          <div className="fld !mb-0">
            <label htmlFor={id('p')}>CME points</label>
            <input id={id('p')} name="credits" type="number" min={0} step={0.25} className="inp" defaultValue={s?.credits ?? 1} />
            <span className="help">Use 0 for breaks and anything without CME.</span>
          </div>
        )}
        <div className="fld !mb-0">
          <label htmlFor={id('cap')}>Capacity<span className="opt">optional</span></label>
          <input id={id('cap')} name="capacity" type="number" min={1} step={1} className="inp" defaultValue={s?.capacity ?? ''} />
          <span className="help">Scans stop when it’s full.</span>
        </div>
      </div>
      {bilingual && (
        <div className="mt-3.5 grid gap-x-4 sm:grid-cols-3">
          <ArabicInput name="title" label="Title" defaultValue={arText(s, 'title')} maxLength={160} idSuffix={s?.id ?? 'new'} className="!mb-0 sm:col-span-3" />
          {!TY.gates && <ArabicInput name="chairs" label={TY.chair} defaultValue={arText(s, 'chairs')} maxLength={200} idSuffix={s?.id ?? 'new'} className="!mb-0 sm:col-span-2" />}
          {!TY.gates && <ArabicInput name="location" label="Room or place" defaultValue={arText(s, 'location')} maxLength={120} idSuffix={s?.id ?? 'new'} className="!mb-0" />}
        </div>
      )}
    </>
  );
}
