import 'server-only';
import { prisma, type Organisation, type Plan, type PlanPurchase } from '@zemmz/db';
import { formatDate, formatMoney, platformEmail } from '@zemmz/shared';
import { checkPayment } from './payments';
import { appUrl } from './email';
import { planDef, planVatBps } from './plans';

/**
 * Paying zemmz for a plan by card. Each purchase is one year of the plan
 * (Season, Enterprise) or one more event (Single event), paid up front: the
 * same hosted checkout as tickets, so it works with Stripe and Tap alike and
 * there is no stored card to manage. Renewal reminders come from the worker.
 */

export function planQuote(plan: Plan, country: string) {
  const def = planDef(plan);
  if (def.priceMinor == null) return null;
  const vatBps = planVatBps(country);
  const vat = Math.round((def.priceMinor * vatBps) / 10_000);
  return { amountMinor: def.priceMinor, vatMinor: vat, vatBps, totalMinor: def.priceMinor + vat, currency: 'AED' };
}

const YEAR = 365 * 86_400_000;

/** Records a paid purchase and extends the plan. Idempotent, like markOrderPaid. */
export async function markPurchasePaid(purchaseId: string, ref: string) {
  return prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ status: string }[]>`SELECT status::text FROM "PlanPurchase" WHERE id = ${purchaseId} FOR UPDATE`;
    if (!row || row.status === 'PAID') return false;
    const p = await tx.planPurchase.findUniqueOrThrow({ where: { id: purchaseId }, include: { organisation: true } });
    const org = p.organisation;
    const now = new Date();
    if (planDef(p.plan).product === 'play') {
      // zemmz Play: months from the current end (or now), on the plan bought.
      const from = org.playPlan === p.plan && org.playPlanEndsAt && org.playPlanEndsAt > now ? org.playPlanEndsAt : now;
      const end = new Date(from);
      end.setUTCMonth(end.getUTCMonth() + p.months);
      await tx.planPurchase.update({ where: { id: p.id }, data: { status: 'PAID', paidAt: now, providerRef: ref, periodEnd: end } });
      await tx.organisation.update({ where: { id: org.id }, data: { playPlan: p.plan, playPlanEndsAt: end } });
      await tx.activityLog.create({ data: { organisationId: org.id, actorLabel: p.byLabel || 'zemmz', action: `paid ${formatMoney(p.totalMinor, p.currency)} for zemmz Play ${planDef(p.plan).name}, until ${formatDate(end, 'Asia/Dubai')}` } });
      return true;
    }
    // Renewing early adds a year to the current end; after it ended, a year from now.
    const samePlan = org.plan === p.plan && org.planStatus === 'ACTIVE';
    const from = samePlan && org.planEndsAt && org.planEndsAt > now ? org.planEndsAt : now;
    const periodEnd = new Date(from.getTime() + YEAR);
    await tx.planPurchase.update({ where: { id: p.id }, data: { status: 'PAID', paidAt: now, providerRef: ref, periodEnd } });
    await tx.organisation.update({
      where: { id: org.id },
      data: {
        plan: p.plan,
        planStatus: 'ACTIVE',
        activatedAt: org.planStatus === 'ACTIVE' ? org.activatedAt ?? now : now,
        planEndsAt: periodEnd,
        planReminder: '',
        // A single-event purchase is one more event; switching plan starts the count again.
        eventCredits: p.plan === 'EVENT' ? (org.plan === 'EVENT' && org.planStatus === 'ACTIVE' ? org.eventCredits : 0) + 1 : org.eventCredits,
      },
    });
    await tx.contactRequest.updateMany({ where: { kind: 'UPGRADE', handledAt: null, message: { contains: org.id } }, data: { handledAt: now } });
    await tx.activityLog.create({ data: { organisationId: org.id, actorLabel: p.byLabel || 'zemmz', action: `paid ${formatMoney(p.totalMinor, p.currency)} for the ${planDef(p.plan).name} plan, until ${formatDate(periodEnd, 'Asia/Dubai')}` } });
    const owners = await tx.membership.findMany({ where: { organisationId: org.id, role: 'OWNER' }, include: { user: true } });
    const body = platformEmail({
      heading: `Thanks, your ${planDef(p.plan).name} plan is active`,
      paragraphs: [
        `We received ${formatMoney(p.totalMinor, p.currency)}. ${p.plan === 'EVENT' ? 'That’s one more event.' : ''} The plan runs until ${formatDate(periodEnd, 'Asia/Dubai')}.`,
        'Your tax invoice is in Organisation, Plan.',
      ],
      button: { label: 'See your plan', url: `${appUrl()}/organisation?tab=plan` },
    });
    for (const m of owners) {
      await tx.outboundMessage.create({ data: { channel: 'EMAIL', toAddress: m.user.email, toName: m.user.name, subject: `Payment received: ${planDef(p.plan).name} plan`, html: body.html, text: body.text } });
    }
    return true;
  });
}

export async function markPurchaseFailed(purchaseId: string) {
  const r = await prisma.planPurchase.updateMany({ where: { id: purchaseId, status: 'PENDING' }, data: { status: 'FAILED' } });
  return r.count > 0;
}

export async function syncPurchase(p: Pick<PlanPurchase, 'id' | 'status' | 'provider' | 'providerSession'>): Promise<'paid' | 'failed' | 'pending'> {
  if (p.status === 'PAID') return 'paid';
  if (!p.providerSession || p.provider === 'mock') return p.status === 'FAILED' ? 'failed' : 'pending';
  const r = await checkPayment(p.provider, p.providerSession);
  if (r.status === 'paid') {
    await markPurchasePaid(p.id, r.ref);
    return 'paid';
  }
  if (r.status === 'failed') {
    await markPurchaseFailed(p.id);
    return 'failed';
  }
  return p.status === 'FAILED' ? 'failed' : 'pending';
}

export function purchaseInvoiceNumber(p: Pick<PlanPurchase, 'id' | 'createdAt'>) {
  return `ZP-${p.createdAt.toISOString().slice(0, 10).replace(/-/g, '')}-${p.id.slice(-6).toUpperCase()}`;
}

/* ------------------------------------------------------------------ */
/* What a plan allows                                                   */
/* ------------------------------------------------------------------ */

/** Events created in the last 12 months, which is what Season's six count. */
export async function eventsThisYear(organisationId: string, now = new Date()) {
  return prisma.event.count({ where: { organisationId, createdAt: { gte: new Date(now.getTime() - YEAR) } } });
}

/**
 * Whether the organisation can create another event, and if not, why and
 * what to do. Trials can create events (they're limited by attendees);
 * paused accounts can't.
 */
export async function eventAllowance(org: Pick<Organisation, 'id' | 'plan' | 'planStatus' | 'eventCredits'>): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (org.planStatus === 'TRIAL') return { ok: true };
  if (org.planStatus === 'SUSPENDED') return { ok: false, reason: 'Your account is paused, so new events can’t be created. Renew your plan under Organisation, Plan.' };
  if (org.plan === 'ENTERPRISE') return { ok: true };
  if (org.plan === 'EVENT') {
    const used = await prisma.event.count({ where: { organisationId: org.id } });
    if (used < org.eventCredits) return { ok: true };
    return { ok: false, reason: `Your single-event plan covers ${org.eventCredits} ${org.eventCredits === 1 ? 'event' : 'events'} and you have ${used}. Buy another event, or move to Season for six a year, under Organisation, Plan.` };
  }
  const used = await eventsThisYear(org.id);
  const limit = planDef(org.plan).events ?? Infinity;
  if (used < limit) return { ok: true };
  return { ok: false, reason: `The Season plan covers ${limit} events a year and you’ve created ${used} in the last 12 months. Talk to us about the enterprise plan for more.` };
}

/** Days until the plan ends (negative after), or null when it doesn't end. */
export function daysLeft(org: Pick<Organisation, 'planStatus' | 'planEndsAt'>, now = new Date()) {
  if (org.planStatus !== 'ACTIVE' || !org.planEndsAt) return null;
  return Math.ceil((org.planEndsAt.getTime() - now.getTime()) / 86_400_000);
}
