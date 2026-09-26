import 'server-only';
import { prisma } from '@zemmz/db';

export interface Balance {
  currency: string;
  /** What buyers paid for tickets (VAT included), less refunds, card processing and any absorbed fees. */
  earnedMinor: number;
  paidOutMinor: number;
  /** Earned on orders more than PAYOUT_DELAY_DAYS old, less what's been paid out. */
  availableMinor: number;
  balanceMinor: number;
}

/** Money is held this long before it's paid out, so most refunds come out of it first. */
export const PAYOUT_DELAY_DAYS = 7;

/**
 * An organisation's ticket money per currency. zemmz collects every payment
 * (it's the merchant) and owes the organiser their share: the tickets and VAT,
 * minus refunds, minus the booking fee when the organiser absorbs it.
 */
export async function balances(organisationId: string, now = new Date()): Promise<Balance[]> {
  const cutoff = new Date(now.getTime() - PAYOUT_DELAY_DAYS * 86_400_000);
  // Ticket orders (Live) and entry fees (Play), each as what the organiser is owed.
  const rows = await prisma.$queryRaw<{ currency: string; earned: bigint; matured: bigint }[]>`
    WITH owed AS (
      SELECT o.currency, o."paidAt",
        o."subtotalMinor" - o."discountMinor" + o."vatMinor" - CASE WHEN o."feePassedOn" THEN 0 ELSE o."feeMinor" END - o."processingMinor" - o."refundedMinor" AS share
      FROM "Order" o JOIN "Event" e ON e.id = o."eventId"
      WHERE e."organisationId" = ${organisationId} AND o.status IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED') AND o.provider <> 'free'
      UNION ALL
      SELECT x.currency, x."paidAt", x."amountMinor" - x."processingMinor" - x."refundedMinor" AS share
      FROM "EntryOrder" x JOIN "Tournament" t ON t.id = x."tournamentId" JOIN "PlayProject" p ON p.id = t."projectId"
      WHERE p."organisationId" = ${organisationId} AND x.status IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
    )
    SELECT currency, SUM(share) AS earned,
      SUM(CASE WHEN "paidAt" < (${cutoff}::timestamptz AT TIME ZONE 'UTC') THEN share ELSE 0 END) AS matured
    FROM owed GROUP BY currency`;
  const paid = await prisma.payout.groupBy({ by: ['currency'], where: { organisationId }, _sum: { amountMinor: true } });
  const currencies = new Set([...rows.map((r) => r.currency), ...paid.map((p) => p.currency)]);
  return [...currencies].sort().map((currency) => {
    const r = rows.find((x) => x.currency === currency);
    const earned = Number(r?.earned ?? 0);
    const matured = Number(r?.matured ?? 0);
    const out = paid.find((p) => p.currency === currency)?._sum.amountMinor ?? 0;
    return { currency, earnedMinor: earned, paidOutMinor: out, availableMinor: Math.max(0, matured - out), balanceMinor: earned - out };
  });
}

/** IBANs are stored without spaces, upper case; shown in groups of four. */
export const normaliseIban = (s: string) => s.replace(/\s+/g, '').toUpperCase();
export const formatIban = (s: string) => s.replace(/(.{4})/g, '$1 ').trim();

/** ISO 13616 mod-97 check. */
export function validIban(iban: string) {
  const s = normaliseIban(iban);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const moved = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of moved) {
    const v = ch >= 'A' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of v) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}
