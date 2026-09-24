import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@zemmz/db';
import { eventType, formatDateRange } from '@zemmz/shared';
import { requireEvent } from '@/lib/auth';
import { onboardingSteps } from '@/lib/onboarding';
import { OnboardingShell } from '@/components/onboarding-shell';

export const metadata: Metadata = { title: 'Your event is set up' };

const Check = () => <svg className="i" viewBox="0 0 24 24" style={{ width: 14, height: 14 }} aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;

/** The end of onboarding: what's done and what's left, from the real data (live-marketing.html, step 11). */
export default async function Welcome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, event } = await requireEvent(slug);
  const TY = eventType(event.type);
  const [tickets, people, sessions, invites, logo] = await Promise.all([
    prisma.ticketType.findMany({ where: { eventId: event.id } }),
    prisma.person.count({ where: { eventId: event.id } }),
    prisma.session.count({ where: { eventId: event.id } }),
    prisma.invitation.count({ where: { organisationId: user.organisationId, acceptedAt: null } }),
    event.logoAssetId,
  ]);
  const paid = tickets.some((t) => t.priceMinor > 0);
  const base = `/events/${slug}`;
  const afterLine = TY.credits
    ? `CME: ${event.creditRule === 'duration' ? `points by time in the room (${event.creditThresholdPct}%)` : 'points for checking in'}`
    : TY.gates ? `${sessions} ${sessions === 1 ? 'entrance' : 'gates'}${event.allowPassOut ? ', pass-outs on' : ''}, after-show page ready`
      : TY.cert === 'none' ? 'After-event page ready for recordings, photos and the survey' : 'Certificates of attendance ready';
  const done: [string, string?][] = [
    ['Create your account'],
    [`${TY.label}: ${tickets.length} ${paid ? 'ticket' : 'registration'} ${tickets.length === 1 ? 'type' : 'types'}`],
    [afterLine],
    [logo ? 'Logo and event colour' : 'Event colour'],
    ...(invites ? [[`Invite your team`, `${invites} invited`] as [string, string]] : []),
  ];
  const todo: [string, string, string][] = [
    ...(!TY.gates && !sessions ? [[TY.credits ? 'Build the session schedule' : 'Build the agenda', 'Needed for check-in', `${base}/check-in`] as [string, string, string]] : []),
    ...(!people ? [[`Add ${TY.people.toLowerCase()}`, TY.gates ? 'About 10 minutes' : 'About 20 minutes', `${base}/people`] as [string, string, string]] : []),
    ['Check your confirmation email', 'Template ready', `${base}/messages`],
    ...(paid ? [['Connect card payments', 'Needed before selling paid tickets', `${base}/tickets?tab=pay`] as [string, string, string]] : []),
    ...(!invites ? [['Invite your team', 'Check-in staff and editors', '/organisation']] as [string, string, string][] : []),
  ];
  const steps = onboardingSteps(event.type, paid);

  return (
    <OnboardingShell steps={steps} current={steps.length} signIn={false}>
      <div className="done-hero"><svg className="i" viewBox="0 0 24 24" style={{ width: 34, height: 34 }} aria-hidden="true"><path d="M4 20 9 7l8 8-13 5Z" /><path d="M14 4v2M19 9h2M17 6l1.5-1.5M12 9c2-2 2-4 1-5M15 12c2-2 4-2 5-1" /></svg></div>
      <h1>{event.name} is set up</h1>
      <p className="lead">
        Your {TY.label.toLowerCase()} website is ready at <b>/e/{event.slug}</b> for {formatDateRange(event.startsOn, event.endsOn, 'UTC')}, with {event.registrationOpen ? 'registration open' : 'ticket sales ready to switch on'}. Here’s what’s left.
      </p>
      <div className="check">
        {done.map(([t, s]) => <div key={t}><span className="ck y"><Check /></span>{t}{s && <small>{s}</small>}</div>)}
        {todo.map(([t, s, href]) => <div key={t}><span className="ck n" /><Link href={href} style={{ color: 'inherit' }}>{t}</Link><small>{s}</small></div>)}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link className="btn primary" href={base}>Go to your dashboard</Link>
        <Link className="btn ghost" href={`/e/${event.slug}`} target="_blank" rel="noopener">See your event website</Link>
      </div>
      <p className="hintnote" style={{ marginTop: 18 }}>Your free trial covers your first 50 attendees. The help centre walks through each stage: before, on the day and after.</p>
    </OnboardingShell>
  );
}
