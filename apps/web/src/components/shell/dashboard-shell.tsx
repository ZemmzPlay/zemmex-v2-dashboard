import Link from 'next/link';
import { Suspense } from 'react';
import { TourRunner } from '../tour';
import type { Event, PlayProject, Role } from '@zemmz/db';
import { eventType, formatDateRange } from '@zemmz/shared';
import { prisma } from '@zemmz/db';
import { can, isPlatformAdmin, ROLE_LABEL, type CurrentUser } from '@/lib/auth';
import { kfmt } from '@/lib/format';
import { PLAN_GRACE_DAYS, TRIAL_ATTENDEES } from '@/lib/plans';
import { daysLeft } from '@/lib/billing';
import { playAccess } from '@/lib/play/billing';
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

function playNav(p: PlayProject, role: Role, counts: { reports: number; pending: number }): [string, NavItem[]][] {
  const base = `/play/${p.slug}`;
  if (role === 'CHECKIN') {
    return [['Moderation', [
      { href: `${base}/tournaments?tab=reports`, icon: 'image', label: 'Score reports', count: counts.reports ? String(counts.reports) : undefined },
      { href: `${base}/players`, icon: 'users', label: 'Players', count: counts.pending ? String(counts.pending) : undefined },
    ]]];
  }
  return [
    ['Website', [
      { href: base, icon: 'dash', label: 'Dashboard', exact: true },
      { href: `${base}/tournaments`, icon: 'trophy', label: 'Tournaments', count: counts.reports ? String(counts.reports) : undefined },
      { href: `${base}/players`, icon: 'users', label: 'Players', count: counts.pending ? String(counts.pending) : undefined },
    ]],
    ['Content', [
      { href: `${base}/website`, icon: 'globe', label: 'Website' },
      { href: `${base}/settings`, icon: 'settings', label: 'Settings' },
      ...(can.manageEvent(role) ? [{ href: '/play/plan', icon: 'star' as const, label: 'Plan' }] : []),
    ]],
  ];
}

const projectSwitcher = (p: PlayProject): SwitcherEvent => ({ href: `/play/${p.slug}`, slug: p.slug, name: p.name, short: p.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase(), colour: p.colour, sub: `${p.slug}.zemmz.gg` });

export async function DashboardShell({ user, event, play, product, children }: { user: CurrentUser; event?: Event; play?: PlayProject; product?: 'live' | 'play'; children: React.ReactNode }) {
  const inPlay = !!play || product === 'play';
  const [events, org] = await Promise.all([
    prisma.event.findMany({ where: { organisationId: user.organisationId, archivedAt: null }, orderBy: { startsOn: 'desc' } }),
    prisma.organisation.findUniqueOrThrow({ where: { id: user.organisationId }, select: { id: true, planStatus: true, planEndsAt: true, playPlan: true, playPlanEndsAt: true, playTrialEndsAt: true } }),
  ]);
  const left = daysLeft(org);
  let playBanner: React.ReactNode = null;
  if (inPlay && can.seeDashboard(user.role)) {
    const a = await playAccess(org);
    const days = a.endsAt ? Math.ceil((a.endsAt.getTime() - Date.now()) / 86_400_000) : null;
    if (a.state === 'trial' || a.state === 'lapsed' || (a.state === 'active' && days != null && days <= 7)) {
      playBanner = (
        <div className={`notice ${a.state === 'lapsed' ? 'err' : a.state === 'trial' && (days ?? 99) > 3 ? 'info' : 'warn'} no-print mb-5 items-center`} role="status">
          <span className="flex-1">
            {a.state === 'lapsed' ? 'Your zemmz Play plan has ended, so your tournament websites are offline. Nothing is deleted for 60 days.'
              : a.state === 'trial' ? `Free trial of Season: ${days} ${days === 1 ? 'day' : 'days'} left.`
                : `Your zemmz Play plan ends in ${days} ${days === 1 ? 'day' : 'days'}.`}
          </span>
          <Link href="/play/plan" className="btn secondary sm">{a.state === 'trial' ? 'Choose a plan' : 'Renew'}</Link>
        </div>
      );
    }
  }
  const trialUsed = org.planStatus === 'TRIAL' ? await prisma.registration.count({ where: { status: 'CONFIRMED', event: { organisationId: user.organisationId } } }) : 0;
  let groups: [string, NavItem[]][];
  let projects: PlayProject[] = [];
  if (play) {
    const [reports, pending, list] = await Promise.all([
      prisma.match.count({ where: { tournament: { projectId: play.id, status: 'LIVE' }, status: { in: ['REVIEW', 'CONFLICT'] } } }),
      prisma.playPlayer.count({ where: { projectId: play.id, verification: 'PENDING', blacklisted: false } }),
      prisma.playProject.findMany({ where: { organisationId: user.organisationId, archivedAt: null }, orderBy: { createdAt: 'asc' } }),
    ]);
    projects = list;
    groups = playNav(play, user.role, { reports, pending });
  } else if (event) {
    const [regs, live] = await Promise.all([
      prisma.registration.count({ where: { eventId: event.id, status: 'CONFIRMED' } }),
      prisma.session.count({ where: { eventId: event.id, status: 'LIVE' } }),
    ]);
    groups = eventNav(event, user.role, { regs, live: live > 0 });
  } else {
    groups = [
      inPlay
        ? ['Tournament websites', [{ href: '/play', icon: 'trophy', label: 'All websites', exact: true }, ...(can.manageEvent(user.role) ? [{ href: '/play/plan', icon: 'star' as const, label: 'Plan' }] : [])]]
        : ['Events', [{ href: '/events', icon: 'folder', label: 'All events', exact: true }, ...(can.manageEvent(user.role) ? [{ href: '/events/new', icon: 'plus' as const, label: 'New event' }] : [])]],
      ['Products', ([
        { href: '/events', icon: 'ticket', label: 'zemmz Live', exact: true },
        { href: '/play', icon: 'gamepad', label: 'zemmz Play', exact: true },
      ] satisfies NavItem[]).filter((i) => (inPlay ? i.href !== '/play' : i.href !== '/events'))],
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
      <Sidebar groups={groups} current={play ? projectSwitcher(play) : event ? toSwitcher(event) : null} events={play ? projects.map(projectSwitcher) : events.map(toSwitcher)} product={inPlay ? 'play' : 'live'} />
      <div className="main">
        <header className="topbar no-print">
          <DrawerToggle />
          <div className="ml-auto flex items-center gap-3">
            {event && (
              <Link className="btn secondary sm max-sm:!hidden" href={`/e/${event.slug}`} target="_blank" rel="noopener">
                <Icon name="ext" size={15} /> View event website
              </Link>
            )}
            {play && (
              <Link className="btn secondary sm max-sm:!hidden" href={`/p/${play.slug}`} target="_blank" rel="noopener">
                <Icon name="ext" size={15} /> View website
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
          {!inPlay && org.planStatus === 'TRIAL' && can.seeDashboard(user.role) && (
            <div className={`notice ${trialUsed >= TRIAL_ATTENDEES ? 'err' : trialUsed >= TRIAL_ATTENDEES * 0.8 ? 'warn' : 'info'} no-print mb-5 items-center`} role="status">
              <span className="flex-1">
                {trialUsed >= TRIAL_ATTENDEES
                  ? `Your free trial is full (${TRIAL_ATTENDEES} attendees), so new registrations are paused.`
                  : `Free trial: ${trialUsed} of ${TRIAL_ATTENDEES} attendees.`}
              </span>
              <Link href="/organisation?tab=plan" className="btn secondary sm">{trialUsed >= TRIAL_ATTENDEES ? 'Activate your plan' : 'Choose a plan'}</Link>
            </div>
          )}
          {!inPlay && org.planStatus === 'SUSPENDED' && can.seeDashboard(user.role) && (
            <div className="notice err no-print mb-5 items-center" role="alert">
              <span className="flex-1">This account is paused, so registrations are closed on your event websites.</span>
              <Link href="/organisation?tab=plan" className="btn secondary sm">Renew your plan</Link>
            </div>
          )}
          {inPlay && playBanner}
          {!inPlay && left != null && left <= 14 && can.seeDashboard(user.role) && (
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
