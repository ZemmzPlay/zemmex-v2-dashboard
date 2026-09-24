import { prisma, type OutboundMessage } from '@zemmz/db';
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
