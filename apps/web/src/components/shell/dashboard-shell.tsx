import Link from 'next/link';
import type { Event, Role } from '@zemmz/db';
import { eventType, formatDateRange } from '@zemmz/shared';
import { prisma } from '@zemmz/db';
import { can, ROLE_LABEL, type CurrentUser } from '@/lib/auth';
import { kfmt } from '@/lib/format';
import { Avatar } from '../avatar';
import { Icon } from '../icon';
import { DrawerToggle, Sidebar, type NavItem, type SwitcherEvent } from './sidebar';
import { logout } from '@/app/login/actions';

function eventNav(e: Event, role: Role, counts: { regs: number; live: boolean }): [string, NavItem[]][] {
  const t = eventType(e.type);
  const base = `/events/${e.slug}`;
  if (role === 'CHECKIN') {
    return [['Event', [{ href: `${base}/check-in`, icon: 'scan', label: t.ckNav, count: counts.live ? 'Live' : undefined }]]];
  }
  return [
    ['Event', [
      { href: base, icon: 'dash', label: 'Dashboard', exact: true },
      { href: `${base}/registrations`, icon: 'id', label: t.regs, count: kfmt(counts.regs) },
      { href: `${base}/tickets`, icon: 'ticket', label: 'Tickets', soon: true },
      { href: `${base}/check-in`, icon: 'scan', label: t.ckNav, count: counts.live ? 'Live' : undefined },
      { href: `${base}/certificates`, icon: t.cert === 'none' ? 'star' : 'award', label: t.certNav, soon: true },
      { href: `${base}/evaluation`, icon: 'form', label: t.evalNav, soon: true },
    ]],
    ['Content', [
      { href: `${base}/people`, icon: t.gates ? 'music' : 'users', label: t.people, soon: true },
      { href: `${base}/messages`, icon: 'mail', label: 'Messages' },
      { href: `${base}/website`, icon: 'globe', label: 'Website', soon: true },
    ]],
    ['Tools', [
      { href: `${base}/raffle`, icon: 'gift', label: t.raffle, soon: true },
      { href: `${base}/settings`, icon: 'settings', label: 'Settings' },
    ]],
  ];
}

export function toSwitcher(e: Event): SwitcherEvent {
  return { slug: e.slug, name: e.name, short: e.shortName, colour: e.accentColour, sub: `${eventType(e.type).label} · ${formatDateRange(e.startsOn, e.endsOn, 'UTC')}` };
}

export async function DashboardShell({ user, event, children }: { user: CurrentUser; event?: Event; children: React.ReactNode }) {
  const events = await prisma.event.findMany({ where: { organisationId: user.organisationId, archivedAt: null }, orderBy: { startsOn: 'desc' } });
  let groups: [string, NavItem[]][];
  if (event) {
    const [regs, live] = await Promise.all([
      prisma.registration.count({ where: { eventId: event.id, status: 'CONFIRMED' } }),
      prisma.session.count({ where: { eventId: event.id, status: 'LIVE' } }),
    ]);
    groups = eventNav(event, user.role, { regs, live: live > 0 });
  } else {
    groups = [['Organisation', [{ href: '/events', icon: 'folder', label: 'All events', exact: true }, ...(can.manageEvent(user.role) ? [{ href: '/events/new', icon: 'plus' as const, label: 'New event' }] : []), ...(process.env.MESSAGING_PROVIDER !== 'sendgrid' ? [{ href: '/outbox', icon: 'inbox' as const, label: 'Email outbox' }] : [])]]];
  }

  return (
    <div className="app">
      <a href="#main" className="sr-only-focusable fixed left-2 top-2 z-[80] rounded-lg bg-surface px-3 py-2">Skip to content</a>
      <Sidebar groups={groups} current={event ? toSwitcher(event) : null} events={events.map(toSwitcher)} />
      <div className="main">
        <header className="topbar no-print">
          <DrawerToggle />
          <div className="ml-auto flex items-center gap-3">
            {event && (
              <Link className="btn secondary sm max-sm:!hidden" href={`/e/${event.slug}`} target="_blank" rel="noopener">
                <Icon name="ext" size={15} /> View event website
              </Link>
            )}
            <div className="flex items-center gap-2.5">
              <Avatar name={user.name} size={36} />
              <span className="max-sm:hidden">
                <b className="block text-[13px] font-semibold">{user.name}</b>
                <small className="block text-[11.5px] text-muted">{user.organisationName} · {ROLE_LABEL[user.role]}</small>
              </span>
              <form action={logout}>
                <button className="btn ghost sm" aria-label="Sign out" title="Sign out">
                  <Icon name="logout" size={16} />
                </button>
              </form>
            </div>
          </div>
        </header>
        <main id="main" className="view" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
