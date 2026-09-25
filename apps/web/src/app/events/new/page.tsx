import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { EVENT_TYPES, GULF_TIMEZONES } from '@zemmz/shared';
import { can, requireUser } from '@/lib/auth';
import Link from 'next/link';
import { prisma } from '@zemmz/db';
import { eventAllowance } from '@/lib/billing';
import { DashboardShell } from '@/components/shell/dashboard-shell';
import { NewEventForm } from './new-event-form';

export const metadata: Metadata = { title: 'New event' };

const NOTES: Record<string, string> = {
  conference: 'Paid tiers, certificates of attendance',
  medical: 'CME points, accredited certificates, KIMS evaluation',
  summit: 'Paid tiers, recordings and slides afterwards',
  concert: 'Gates, pass-outs, an after-show page',
  workshop: 'Paid, certificates of completion',
  exhibition: 'Visitor and exhibitor passes',
  gala: 'Invitations or paid, photos afterwards',
};

export default async function NewEventPage() {
  const user = await requireUser();
  if (!can.manageEvent(user.role)) redirect('/events');
  const host = (await headers()).get('host') ?? 'zemmz.com';
  const order = ['conference', 'medical', 'summit', 'concert', 'workshop', 'exhibition', 'gala'] as const;
  const allowance = await eventAllowance(await prisma.organisation.findUniqueOrThrow({ where: { id: user.organisationId } }));
  return (
    <DashboardShell user={user}>
      <div className="ph"><div><h1>New event</h1><p>You can change everything later.</p></div></div>
      {!allowance.ok ? (
        <div className="notice warn max-w-[640px]">
          {allowance.reason} <Link href="/organisation?tab=plan" className="font-semibold">Go to your plan</Link>
        </div>
      ) : <NewEventForm types={order.map((k) => ({ key: k, label: EVENT_TYPES[k].label, note: NOTES[k] }))} timezones={GULF_TIMEZONES} host={host} />}
    </DashboardShell>
  );
}
