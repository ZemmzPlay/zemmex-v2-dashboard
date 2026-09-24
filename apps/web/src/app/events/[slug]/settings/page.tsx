import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma, type Event } from '@zemmz/db';
import { eventType, formatShortDateTime } from '@zemmz/shared';
import { can, requirePermission, ROLE_LABEL } from '@/lib/auth';
import { relativeTime } from '@/lib/format';
import { Avatar } from '@/components/avatar';
import { archiveEvent, saveDetails, saveWhen } from './actions';
import { SimpleForm } from '@/components/simple-form';
import { ConfirmButton } from '@/components/confirm-button';
import { GULF_TIMEZONES, CURRENCIES, dayKey } from '@zemmz/shared';
import { DetailsForm } from './details-form';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { slug } = await params;
  const { tab = 'event' } = await searchParams;
  const { user, event } = await requirePermission(slug, can.seeDashboard);
  const base = `/events/${slug}/settings`;
  const tabs: [string, string][] = [['event', 'Event details'], ['team', 'People with access'], ['log', 'Activity log']];

  return (
    <>
      <div className="ph"><div><h1>Settings</h1><p>{event.name}</p></div></div>
      <nav className="tabs" aria-label="Settings">
        {tabs.map(([k, l]) => <Link key={k} href={`${base}?tab=${k}`} aria-current={tab === k ? 'page' : undefined}>{l}</Link>)}
      </nav>

      {tab === 'event' && (
        <>
        <DetailsForm
          action={saveDetails.bind(null, slug)}
          canEdit={can.manageEvent(user.role)}
          initial={{ name: event.name, shortName: event.shortName, organiserName: event.organiserName }}
          links={{ website: `/events/${slug}/website`, ...(eventType(event.type).credits ? { certificates: `/events/${slug}/certificates`, certNav: eventType(event.type).certNav } : {}) }}
        />
        <When slug={slug} event={event} canEdit={can.manageEvent(user.role)} />
        </>
      )}
      {tab === 'team' && <Team organisationId={user.organisationId} />}
      {tab === 'log' && <Log eventId={event.id} tz={event.timezone} />}
    </>
  );
}

async function Team({ organisationId }: { organisationId: string }) {
  const members = await prisma.membership.findMany({ where: { organisationId }, include: { user: true }, orderBy: { createdAt: 'asc' } });
  return (
    <>
      <p className="mt-0 max-w-[70ch] text-ink-2">
        Owners and admins manage everything. Content editors manage registrations, messages and the website, but not event settings or who has access. Check-in staff only see the check-in console.
      </p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Name</th><th>Role</th><th>Last active</th></tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td><div className="flex items-center gap-2.5"><Avatar name={m.user.name} size={30} /><div><b className="font-semibold">{m.user.name}</b><div className="muted">{m.user.email}</div></div></div></td>
                <td><span className="tag">{ROLE_LABEL[m.role]}</span></td>
                <td className="muted">{m.user.lastSeenAt ? relativeTime(m.user.lastSeenAt) : 'Not yet'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12.5px] text-muted">Inviting people by email is the next step for this screen.</p>
    </>
  );
}

async function Log({ eventId, tz }: { eventId: string; tz: string }) {
  const rows = await prisma.activityLog.findMany({ where: { eventId }, orderBy: { createdAt: 'desc' }, take: 200 });
  if (!rows.length) return <div className="card empty"><h3>Nothing logged yet</h3><p>Every change and every message sent is recorded here with who did it.</p></div>;
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="muted whitespace-nowrap">{formatShortDateTime(r.createdAt, tz)}</td>
              <td className="font-semibold whitespace-nowrap">{r.actorLabel}</td>
              <td>{r.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function When({ slug, event, canEdit }: { slug: string; event: Event; canEdit: boolean }) {
  const [orders, sessions] = await Promise.all([prisma.order.count({ where: { eventId: event.id } }), prisma.session.count({ where: { eventId: event.id } })]);
  const TY = eventType(event.type);
  const zones = GULF_TIMEZONES.some(([z]) => z === event.timezone) ? GULF_TIMEZONES : [[event.timezone, event.timezone] as const, ...GULF_TIMEZONES];
  return (
    <div className="mt-6 max-w-[760px]">
      <SimpleForm action={saveWhen.bind(null, slug)} submitLabel="Save dates" canEdit={canEdit}>
        <section className="fsec">
          <h2>Dates and money</h2>
          <p className="hint">Type of event: <b>{TY.label}</b>. The type sets the words and tools, so it can’t change once an event exists. Create a new event for a different type.</p>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <div className="fld"><label htmlFor="startDate">First day</label><input id="startDate" name="startDate" type="date" className="inp" defaultValue={dayKey(event.startsOn, 'UTC')} required /></div>
            <div className="fld"><label htmlFor="endDate">Last day</label><input id="endDate" name="endDate" type="date" className="inp" defaultValue={dayKey(event.endsOn, 'UTC')} required /></div>
            <div className="fld !mb-0">
              <label htmlFor="timezone">Timezone</label>
              <select id="timezone" name="timezone" className="sel" defaultValue={event.timezone} disabled={sessions > 0}>
                {zones.map(([z, l]) => <option key={z} value={z}>{l}</option>)}
              </select>
              {sessions > 0 && <><input type="hidden" name="timezone" value={event.timezone} /><span className="help">Fixed once the schedule has {TY.units}.</span></>}
            </div>
            <div className="fld !mb-0">
              <label htmlFor="currency">Currency</label>
              <select id="currency" name="currency" className="sel" defaultValue={event.currency} disabled={orders > 0}>
                {Object.keys(CURRENCIES).map((c) => <option key={c}>{c}</option>)}
              </select>
              {orders > 0 && <span className="help">Fixed after the first order.</span>}
            </div>
          </div>
        </section>
      </SimpleForm>
      {canEdit && (
        <section className="fsec mt-6">
          <h2>Archive this event</h2>
          <p className="hint">The website goes offline and the event leaves your event list. Registrations, scans and certificates are kept, and you can restore it from All events.</p>
          <ConfirmButton action={archiveEvent.bind(null, slug)} label="Archive event" title={`Archive ${event.name}?`} body="The event website stops working straight away, including ticket and certificate links. Nothing is deleted, and you can restore it later." confirmLabel="Archive event" />
        </section>
      )}
    </div>
  );
}
