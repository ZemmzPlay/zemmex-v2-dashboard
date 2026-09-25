import { prisma, type OutboundMessage } from '@zemmz/db';
import { platformEmail } from '@zemmz/shared';
import { PermanentSendError, type Provider } from './providers';

const MAX_ATTEMPTS = 5;

/*
 * Prisma stores UTC in `timestamp without time zone` columns. In raw SQL a JS
 * Date arrives as timestamptz, and Postgres would compare using the server's
 * TimeZone setting (Asia/Dubai on a local Windows install): four hours off.
 * Every raw comparison therefore converts the parameter to UTC wall time.
 */
const BATCH = 50;

/**
 * Keeps Session.status in step with the clock so lists, counts and the
 * public site don't each recompute it. Returns how many rows changed.
 */
export async function transitionSessions(now = new Date()) {
  const toLive = await prisma.session.updateMany({
    where: { startsAt: { lte: now }, endsAt: { gt: now }, status: { not: 'LIVE' } },
    data: { status: 'LIVE' },
  });
  const toEnded = await prisma.session.updateMany({
    where: { endsAt: { lte: now }, status: { not: 'ENDED' } },
    data: { status: 'ENDED' },
  });
  // Sessions moved back into the future (edited times) become upcoming again.
  const toUpcoming = await prisma.session.updateMany({
    where: { startsAt: { gt: now }, status: { not: 'UPCOMING' } },
    data: { status: 'UPCOMING' },
  });
  return { live: toLive.count, ended: toEnded.count, upcoming: toUpcoming.count };
}

/**
 * Claims due messages with SKIP LOCKED, so several workers can run without
 * sending anything twice.
 *
 * The locking SELECT sits in a MATERIALIZED CTE so it runs exactly once per
 * claim. jobs.int.test.ts runs three workers against one queue and checks
 * that every message is sent exactly once.
 */
async function claim(now: Date): Promise<OutboundMessage[]> {
  return prisma.$queryRaw<OutboundMessage[]>`
    WITH due AS MATERIALIZED (
      SELECT id FROM "OutboundMessage"
      WHERE status = 'QUEUED' AND "sendAfter" <= (${now}::timestamptz AT TIME ZONE 'UTC')
      ORDER BY "sendAfter" ASC
      LIMIT ${BATCH}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "OutboundMessage" m SET status = 'SENDING', attempts = m.attempts + 1, "claimedAt" = (${now}::timestamptz AT TIME ZONE 'UTC')
    FROM due WHERE m.id = due.id
    RETURNING m.*`;
}

/**
 * Messages stuck in SENDING (a worker died mid-send) go back to the queue.
 * Judged by when they were claimed, not when they were due: after a backlog a
 * message can be due long ago and still be in the middle of sending.
 */
async function releaseStuck(now: Date) {
  const cutoff = new Date(now.getTime() - 10 * 60_000);
  await prisma.$executeRaw`
    UPDATE "OutboundMessage" SET status = 'QUEUED'
    WHERE status = 'SENDING' AND "claimedAt" < (${cutoff}::timestamptz AT TIME ZONE 'UTC')`;
}

export async function dispatchOutbox(provider: Provider, now = new Date()) {
  await releaseStuck(now);
  const batch = await claim(now);
  let sent = 0;
  let failed = 0;
  for (const m of batch) {
    try {
      let result;
      if (m.channel === 'SMS') {
        if (!provider.sendSms) throw new PermanentSendError(`No SMS provider configured (MESSAGING_PROVIDER=${provider.name})`);
        result = await provider.sendSms({ id: m.id, to: m.toAddress, text: m.text });
      } else {
        result = await provider.sendEmail({ id: m.id, to: m.toAddress, toName: m.toName, subject: m.subject, html: m.html, text: m.text });
      }
      await prisma.outboundMessage.update({
        where: { id: m.id },
        data: { status: 'SENT', sentAt: new Date(), provider: provider.name, providerMessageId: result.providerMessageId, lastError: null },
      });
      sent++;
    } catch (err) {
      const permanent = err instanceof PermanentSendError || m.attempts >= MAX_ATTEMPTS;
      const backoffMin = 2 ** m.attempts; // 2, 4, 8, 16 minutes
      await prisma.outboundMessage.update({
        where: { id: m.id },
        data: {
          status: permanent ? 'FAILED' : 'QUEUED',
          sendAfter: permanent ? m.sendAfter : new Date(Date.now() + backoffMin * 60_000),
          provider: provider.name,
          lastError: String((err as Error).message ?? err).slice(0, 1000),
        },
      });
      failed++;
      console.error(`[outbox] ${m.id} ${permanent ? 'failed' : `retry in ${backoffMin} min`}: ${(err as Error).message}`);
    }
  }
  return { claimed: batch.length, sent, failed };
}

/**
 * Releases seats held for buyers who never finished paying. The web app holds
 * them for 45 minutes (Stripe's page expires at 35); this gives 15 more for a
 * slow return or webhook. A payment that still lands later is confirmed by the
 * webhook anyway (lib/orders.ts, markOrderPaid).
 */
export const RELEASE_AFTER_MINUTES = 60;

export async function releaseHeldOrders(now = new Date()) {
  const cutoff = new Date(now.getTime() - RELEASE_AFTER_MINUTES * 60_000);
  const stale = await prisma.order.findMany({ where: { status: 'PENDING', createdAt: { lt: cutoff } }, select: { id: true }, take: 200 });
  if (!stale.length) return 0;
  const ids = stale.map((o) => o.id);
  await prisma.$transaction([
    prisma.order.updateMany({ where: { id: { in: ids }, status: 'PENDING' }, data: { status: 'FAILED' } }),
    prisma.registration.updateMany({ where: { orderId: { in: ids }, status: 'PENDING' }, data: { status: 'CANCELLED' } }),
  ]);
  return ids.length;
}

/**
 * Paid plans last a year. Owners are reminded 30 and 7 days before the end
 * and on the day; registrations stay open for PLAN_GRACE_DAYS after it, then
 * the account is paused until someone renews. Each reminder goes once.
 */
export const PLAN_GRACE_DAYS = 14;
const DAY = 86_400_000;

export async function planRenewals(now = new Date()) {
  const orgs = await prisma.organisation.findMany({
    where: { planStatus: 'ACTIVE', planEndsAt: { not: null, lt: new Date(now.getTime() + 30 * DAY) } },
    include: { memberships: { where: { role: 'OWNER' }, include: { user: true } } },
  });
  const app = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const date = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dubai' });
  let sent = 0;
  for (const org of orgs) {
    const ends = org.planEndsAt!;
    const left = Math.ceil((ends.getTime() - now.getTime()) / DAY);
    const closes = new Date(ends.getTime() + PLAN_GRACE_DAYS * DAY);
    let step = '';
    let heading = '';
    let body = '';
    if (now >= closes) {
      step = 'paused';
      heading = 'Your account is paused';
      body = `Your plan ended on ${date(ends)}, so registrations on your event websites are now closed. Everything you set up is kept: renew and they open again straight away.`;
    } else if (left <= 0) {
      step = 'ended';
      heading = 'Your plan has ended';
      body = `It ended on ${date(ends)}. Registrations stay open until ${date(closes)}; renew before then to keep them open.`;
    } else if (left <= 7) {
      step = '7d';
      heading = `Your plan ends in ${left} ${left === 1 ? 'day' : 'days'}`;
      body = `It ends on ${date(ends)}. Renew now to keep registrations open without a break.`;
    } else {
      step = '30d';
      heading = 'Your plan ends next month';
      body = `It ends on ${date(ends)}. You can renew by card or ask for an invoice from Organisation, Plan.`;
    }
    const order = ['', '30d', '7d', 'ended', 'paused'];
    if (order.indexOf(org.planReminder) >= order.indexOf(step)) continue;
    await prisma.$transaction(async (tx) => {
      await tx.organisation.update({ where: { id: org.id }, data: { planReminder: step, ...(step === 'paused' ? { planStatus: 'SUSPENDED' } : {}) } });
      if (step === 'paused') await tx.activityLog.create({ data: { organisationId: org.id, actorLabel: 'zemmz', action: 'paused the account: the plan wasn’t renewed' } });
      const mail = platformEmail({ heading, paragraphs: [body], button: { label: 'Renew your plan', url: `${app}/organisation?tab=plan` } });
      for (const m of org.memberships) {
        await tx.outboundMessage.create({ data: { channel: 'EMAIL', toAddress: m.user.email, toName: m.user.name, subject: `${heading}: ${org.name}`, html: mail.html, text: mail.text } });
        sent++;
      }
    });
  }
  return sent;
}
