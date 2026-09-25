'use server';

import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@zemmz/db';
import { isPlatformAdmin, requireUser } from '@/lib/auth';
import { platformEmail, queuePlatformEmail } from '@/lib/accounts';
import { appUrl } from '@/lib/email';
import { planDef } from '@/lib/plans';
import { done, failed, type ActionState } from '@/lib/action-state';

async function staff() {
  const user = await requireUser();
  if (!isPlatformAdmin(user.email)) notFound();
  return user;
}

export async function setPlan(organisationId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await staff();
  const parsed = z.object({ plan: z.enum(['EVENT', 'SEASON', 'ENTERPRISE']), planStatus: z.enum(['TRIAL', 'ACTIVE', 'SUSPENDED']) }).safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return failed('Choose a plan and a status.');
  const before = await prisma.organisation.findUnique({ where: { id: organisationId }, include: { memberships: { where: { role: 'OWNER' }, include: { user: true } } } });
  if (!before) return failed('That organisation no longer exists.');
  const { plan, planStatus } = parsed.data;
  await prisma.organisation.update({
    where: { id: organisationId },
    data: { plan, planStatus, activatedAt: planStatus === 'ACTIVE' && before.planStatus !== 'ACTIVE' ? new Date() : before.activatedAt },
  });
  await prisma.activityLog.create({ data: { organisationId, actorId: user.id, actorLabel: `zemmz (${user.name})`, action: `set the plan to ${planDef(plan).name}, ${planStatus.toLowerCase()}` } });
  if (planStatus === 'ACTIVE' && before.planStatus !== 'ACTIVE') {
    await prisma.contactRequest.updateMany({ where: { kind: 'UPGRADE', handledAt: null, message: { contains: organisationId } }, data: { handledAt: new Date() } });
    for (const m of before.memberships) {
      await queuePlatformEmail(m.user, `Your ${planDef(plan).name} plan is active`, platformEmail({
        heading: 'Your plan is active',
        paragraphs: [`Hi ${m.user.name.split(' ')[0]},`, `${before.name} is now on the ${planDef(plan).name} plan. Registration limits from the free trial no longer apply.`],
        button: { label: 'Go to your dashboard', url: `${appUrl()}/events` },
      }));
    }
  }
  revalidatePath('/admin');
  return done(`${before.name}: ${planDef(plan).name}, ${planStatus.toLowerCase()}.`);
}

export async function markHandled(fd: FormData) {
  await staff();
  await prisma.contactRequest.update({ where: { id: String(fd.get('id') ?? '') }, data: { handledAt: new Date() } }).catch(() => undefined);
  revalidatePath('/admin');
}
