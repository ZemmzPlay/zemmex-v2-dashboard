import Link from 'next/link';
import { Suspense } from 'react';
import { TourRunner } from '../tour';
import type { Event, Role } from '@zemmz/db';
import { eventType, formatDateRange } from '@zemmz/shared';
import { prisma } from '@zemmz/db';
import { can, isPlatformAdmin, ROLE_LABEL, type CurrentUser } from '@/lib/auth';
import { kfmt } from '@/lib/format';
import { PLAN_GRACE_DAYS, TRIAL_ATTENDEES } from '@/lib/plans';
import { daysLeft } from '@/lib/billing';
import { OrgSwitcher } from './org-switcher';
import { Avatar } from '../avatar';
import { Icon } from '../icon';
import { DrawerToggle, Sidebar, type NavItem, type SwitcherEvent } from './sidebar';
import { logout } from '@/app/(marketing)/login/actions';

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
      { href: `${base}/tickets`, icon: 'ticket', label: 'Tickets' },
      { href: `${base}/check-in`, icon: 'scan', label: t.ckNav, count: counts.live ? 'Live' : undefined },
      { href: `${base}/certificates`, icon: t.cert === 'none' ? 'star' : 'award', label: t.certNav },
      { href: `${base}/evaluation`, icon: 'form', label: t.evalNav },
    ]],
    ['Content', [
      { href: `${base}/people`, icon: t.gates ? 'music' : 'users', label: t.people },
      { href: `${base}/messages`, icon: 'mail', label: 'Messages' },
      { href: `${base}/website`, icon: 'globe', label: 'Website' },
    ]],
    ['Tools', [
      { href: `${base}/raffle`, icon: 'gift', label: t.raffle },
      { href: `${base}/settings`, icon: 'settings', label: 'Settings' },
      { href: `${base}/help`, icon: 'help', label: 'Help centre' },
    ]],
  ];
}

export function toSwitcher(e: Event): SwitcherEvent {
  return { slug: e.slug, name: e.name, short: e.shortName, colour: e.accentColour, sub: `${eventType(e.type).label} · ${formatDateRange(e.startsOn, e.endsOn, 'UTC')}` };
}

export async function DashboardShell({ user, event, children }: { user: CurrentUser; event?: Event; children: React.ReactNode }) {
  const [events, org] = await Promise.all([
    prisma.event.findMany({ where: { organisationId: user.organisationId, archivedAt: null }, orderBy: { startsOn: 'desc' } }),
    prisma.organisation.findUniqueOrThrow({ where: { id: user.organisationId }, select: { planStatus: true, planEndsAt: true } }),
  ]);
  const left = daysLeft(org);
  const trialUsed = org.planStatus === 'TRIAL' ? await prisma.registration.count({ where: { status: 'CONFIRMED', event: { organisationId: user.organisationId } } }) : 0;
  let groups: [string, NavItem[]][];
  if (event) {
    const [regs, live] = await Promise.all([
      prisma.registration.count({ where: { eventId: event.id, status: 'CONFIRMED' } }),
      prisma.session.count({ where: { eventId: event.id, status: 'LIVE' } }),
    ]);
    groups = eventNav(event, user.role, { regs, live: live > 0 });
  } else {
    groups = [
      ['Events', [{ href: '/events', icon: 'folder', label: 'All events', exact: true }, ...(can.manageEvent(user.role) ? [{ href: '/events/new', icon: 'plus' as const, label: 'New event' }] : [])]],
      ['Organisation', [
        ...(can.seeDashboard(user.role) ? [{ href: '/organisation', icon: 'users' as const, label: 'People and plan' }] : []),
        { href: '/account', icon: 'user', label: 'Your account' },
        ...(process.env.MESSAGING_PROVIDER !== 'sendgrid' ? [{ href: '/outbox', icon: 'inbox' as const, label: 'Email outbox' }] : []),
        ...(isPlatformAdmin(user.email) ? [{ href: '/admin', icon: 'lock' as const, label: 'zemmz admin' }] : []),
      ]],
    ];
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
            {(user.organisations.length > 1 || can.manageEvent(user.role)) && <div className="max-sm:hidden"><OrgSwitcher user={user} /></div>}
            <div className="flex items-center gap-2.5">
              <Avatar name={user.name} size={36} />
              <Link href="/account" className="text-ink no-underline max-sm:hidden" title="Your account">
                <b className="block text-[13px] font-semibold">{user.name}</b>
                <small className="block text-[11.5px] text-muted">{user.organisationName} · {ROLE_LABEL[user.role]}</small>
              </Link>
              <form action={logout}>
                <button className="btn ghost sm" aria-label="Sign out" title="Sign out">
                  <Icon name="logout" size={16} />
                </button>
              </form>
            </div>
          </div>
        </header>
        <main id="main" className="view" tabIndex={-1}>
          {org.planStatus === 'TRIAL' && can.seeDashboard(user.role) && (
            <div className={`notice ${trialUsed >= TRIAL_ATTENDEES ? 'err' : trialUsed >= TRIAL_ATTENDEES * 0.8 ? 'warn' : 'info'} no-print mb-5 items-center`} role="status">
              <span className="flex-1">
                {trialUsed >= TRIAL_ATTENDEES
                  ? `Your free trial is full (${TRIAL_ATTENDEES} attendees), so new registrations are paused.`
                  : `Free trial: ${trialUsed} of ${TRIAL_ATTENDEES} attendees.`}
              </span>
              <Link href="/organisation?tab=plan" className="btn secondary sm">{trialUsed >= TRIAL_ATTENDEES ? 'Activate your plan' : 'Choose a plan'}</Link>
            </div>
          )}
          {org.planStatus === 'SUSPENDED' && can.seeDashboard(user.role) && (
            <div className="notice err no-print mb-5 items-center" role="alert">
              <span className="flex-1">This account is paused, so registrations are closed on your event websites.</span>
              <Link href="/organisation?tab=plan" className="btn secondary sm">Renew your plan</Link>
            </div>
          )}
          {left != null && left <= 14 && can.seeDashboard(user.role) && (
            <div className={`notice ${left < 0 ? 'err' : 'warn'} no-print mb-5 items-center`} role="status">
              <span className="flex-1">
                {left < 0
                  ? `Your plan ended ${-left} ${left === -1 ? 'day' : 'days'} ago. Registrations close ${PLAN_GRACE_DAYS + left <= 0 ? 'today' : `in ${PLAN_GRACE_DAYS + left} ${PLAN_GRACE_DAYS + left === 1 ? 'day' : 'days'}`} unless it’s renewed.`
                  : `Your plan ends in ${left} ${left === 1 ? 'day' : 'days'}.`}
              </span>
              <Link href="/organisation?tab=plan" className="btn secondary sm">Renew</Link>
            </div>
          )}
          {children}
        </main>
        <Suspense fallback={null}><TourRunner /></Suspense>
      </div>
    </div>
  );
}
