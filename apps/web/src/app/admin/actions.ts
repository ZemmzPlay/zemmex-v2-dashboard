'use server';

import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@zemmz/db';
import { isPlatformAdmin, requireUser } from '@/lib/auth';
import { platformEmail, queuePlatformEmail } from '@/lib/accounts';
import { appUrl } from '@/lib/email';
import { planDef } from '@/lib/plans';
import { balances } from '@/lib/payouts';
import { CURRENCIES, formatMoney, isCurrency } from '@zemmz/shared';
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
  // Paid until: the date given, or a year from now when activating by invoice.
  const until = String(fd.get('planEndsAt') ?? '').trim();
  const planEndsAt = until ? new Date(`${until}T20:00:00Z`) : planStatus === 'ACTIVE' && before.planStatus !== 'ACTIVE' ? new Date(Date.now() + 365 * 86_400_000) : before.planEndsAt;
  if (until && Number.isNaN(planEndsAt?.getTime())) return failed('Enter the paid-until date as a date.');
  const credits = Number(String(fd.get('eventCredits') ?? '').trim() || before.eventCredits);
  if (!Number.isInteger(credits) || credits < 0) return failed('Enter the events paid for as a whole number.');
  await prisma.organisation.update({
    where: { id: organisationId },
    data: {
      plan, planStatus, planEndsAt, planReminder: planEndsAt?.getTime() !== before.planEndsAt?.getTime() ? '' : before.planReminder,
      eventCredits: plan === 'EVENT' && planStatus === 'ACTIVE' ? Math.max(1, credits) : credits,
      activatedAt: planStatus === 'ACTIVE' && before.planStatus !== 'ACTIVE' ? new Date() : before.activatedAt,
    },
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

export async function recordPayout(organisationId: string, currency: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await staff();
  const org = await prisma.organisation.findUnique({ where: { id: organisationId }, include: { memberships: { where: { role: 'OWNER' }, include: { user: true } } } });
  if (!org) return failed('That organisation no longer exists.');
  if (!org.payoutIban) return failed('They haven’t added a bank account yet.');
  const exp = isCurrency(currency) ? CURRENCIES[currency].exponent : 2;
  const amount = Math.round(Number(String(fd.get('amount') ?? '').trim()) * 10 ** exp);
  const bal = (await balances(organisationId)).find((b) => b.currency === currency);
  if (!Number.isFinite(amount) || amount <= 0) return failed(`Enter the amount transferred in ${currency}.`);
  if (!bal || amount > bal.balanceMinor) return failed(`That’s more than the ${formatMoney(bal?.balanceMinor ?? 0, currency)} they’re owed.`);
  const reference = String(fd.get('reference') ?? '').trim().slice(0, 80);
  if (!reference) return failed('Enter the bank transfer reference, so both sides can match it.');
  await prisma.payout.create({ data: { organisationId, currency, amountMinor: amount, reference, byLabel: user.name } });
  await prisma.activityLog.create({ data: { organisationId, actorId: user.id, actorLabel: `zemmz (${user.name})`, action: `paid out ${formatMoney(amount, currency)} (${reference})` } });
  for (const m of org.memberships) {
    await queuePlatformEmail({ email: m.user.email, name: m.user.name }, `Payout of ${formatMoney(amount, currency)} sent`, platformEmail({
      heading: `We’ve sent you ${formatMoney(amount, currency)}`,
      paragraphs: [`It’s on its way to the account ending ${org.payoutIban.slice(-4)}, with the reference ${reference}. Banks usually take one to three working days.`],
      button: { label: 'See payouts', url: `${appUrl()}/organisation?tab=payouts` },
    }));
  }
  revalidatePath('/admin');
  return done(`Recorded ${formatMoney(amount, currency)} to ${org.name}.`);
}
