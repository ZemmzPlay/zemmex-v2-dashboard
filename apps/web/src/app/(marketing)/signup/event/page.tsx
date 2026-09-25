import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@zemmz/db';
import { can, requireUser } from '@/lib/auth';
import { EventWizard } from './wizard';

export const metadata: Metadata = { title: 'Set up your first event' };

export default async function OnboardingEvent() {
  const user = await requireUser();
  if (!can.manageEvent(user.role)) redirect('/events');
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: user.organisationId } });
  return <EventWizard country={org.country} plan={org.plan} />;
}
