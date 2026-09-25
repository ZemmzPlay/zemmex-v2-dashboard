import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma, type Event } from '@zemmz/db';
import { eventType, formatShortDateTime } from '@zemmz/shared';
import { can, requirePermission } from '@/lib/auth';
import { archiveEvent, removeCustomDomain, saveDetails, saveWhen, setCustomDomain, verifyCustomDomain } from './actions';
import { domainTarget } from '@/lib/domains';
import { appUrl } from '@/lib/email';
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
  const tabs: [string, string][] = [['event', 'Event details'], ['domain', 'Web address'], ['team', 'People with access'], ['log', 'Activity log']];

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
      {tab === 'domain' && <Domain slug={slug} event={event} canEdit={can.manageEvent(user.role)} />}
      {tab === 'team' && <Team />}
      {tab === 'log' && <Log eventId={event.id} tz={event.timezone} />}
    </>
  );
}

function Team() {
  return (
    <div className="card empty">
      <h3>People are managed for your whole organisation</h3>
      <p>Invite people, change roles and remove access in one place.</p>
      <Link href="/organisation" className="btn primary">Go to people with access</Link>
    </div>
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
          {TY.gates && <label className="switch mt-4"><input type="checkbox" name="allowPassOut" defaultChecked={event.allowPassOut} /> Allow pass-outs: guests can scan out and back in with the same e-ticket</label>}
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

async function Domain({ slug, event, canEdit }: { slug: string; event: Event; canEdit: boolean }) {
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: event.organisationId }, select: { plan: true, planStatus: true } });
  const allowed = org.plan === 'ENTERPRISE' && org.planStatus === 'ACTIVE';
  const d = event.customDomain;
  return (
    <div className="max-w-[760px]">
      <section className="fsec">
        <h2>Where the website lives</h2>
        <p className="m-0 text-[13.5px]">
          {event.customDomainVerifiedAt && d ? <>At <a href={`https://${d}`} target="_blank" rel="noopener">https://{d}</a>, and still at {appUrl()}/e/{slug}.</> : <>At <a href={`/e/${slug}`} target="_blank" rel="noopener">{appUrl()}/e/{slug}</a>.</>}
        </p>
      </section>
      {!allowed ? (
        <div className="notice info">Showing the website on your own domain, such as events.yourcompany.com, comes with the government and enterprise plan. <Link href="/organisation?tab=plan" className="font-semibold">See plans</Link></div>
      ) : (
        <>
          <SimpleForm action={setCustomDomain.bind(null, slug)} submitLabel={d ? 'Change address' : 'Continue'} canEdit={canEdit}>
            <section className="fsec">
              <h2>Your own web address</h2>
              <p className="hint">Use a subdomain of a domain you own. The zemmz address keeps working, and links in emails already sent don’t change.</p>
              <div className="fld !mb-0 max-w-[380px]"><label htmlFor="cd">Address</label><input id="cd" name="domain" className="inp" defaultValue={d ?? ''} placeholder="events.yourcompany.com" /></div>
            </section>
          </SimpleForm>
          {d && (
            <div className="mt-6">
              <SimpleForm action={verifyCustomDomain.bind(null, slug)} submitLabel={event.customDomainVerifiedAt ? 'Check again' : 'Check the records'} canEdit={canEdit}>
                <section className="fsec">
                  <h2>DNS records {event.customDomainVerifiedAt && <span className="badge b-ok ml-2">Connected</span>}</h2>
                  <p className="hint">Add both where your domain’s DNS is managed, then check. It can take up to an hour for changes to show.</p>
                  <div className="tbl-wrap">
                    <table className="tbl">
                      <thead><tr><th>Type</th><th>Name</th><th>Value</th></tr></thead>
                      <tbody>
                        <tr><td className="font-mono">CNAME</td><td className="font-mono">{d}</td><td className="break-all font-mono">{domainTarget()}</td></tr>
                        <tr><td className="font-mono">TXT</td><td className="font-mono">_zemmz.{d}</td><td className="break-all font-mono">{event.customDomainToken}</td></tr>
                      </tbody>
                    </table>
                  </div>
                </section>
              </SimpleForm>
              {canEdit && (
                <div className="mt-6">
                  <ConfirmButton action={removeCustomDomain.bind(null, slug)} label="Remove this address" title={`Stop using ${d}?`} body={<p className="m-0">https://{d} stops showing the event website straight away. The zemmz address keeps working.</p>} confirmLabel="Remove address" />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
