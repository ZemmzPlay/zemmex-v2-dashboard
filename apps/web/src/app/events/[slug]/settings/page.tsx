import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@zemmz/db';
import { formatShortDateTime } from '@zemmz/shared';
import { can, requirePermission, ROLE_LABEL } from '@/lib/auth';
import { relativeTime } from '@/lib/format';
import { Avatar } from '@/components/avatar';
import { saveDetails } from './actions';
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
        <DetailsForm
          action={saveDetails.bind(null, slug)}
          canEdit={can.manageEvent(user.role)}
          medical={event.type === 'medical'}
          initial={{ name: event.name, shortName: event.shortName, organiserName: event.organiserName, heroText: event.heroText, venueName: event.venueName, venueAddress: event.venueAddress, venuePhone: event.venuePhone, accentColour: event.accentColour, creditRule: event.creditRule, creditThresholdPct: event.creditThresholdPct }}
        />
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
