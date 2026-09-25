import { prisma } from '@zemmz/db';
import { fromMinor, isCurrency } from '@zemmz/shared';
import { can, requirePermission } from '@/lib/auth';
import { csvLine } from '@/lib/csv';
import { invoiceNumber } from '@/lib/orders';

/** Every paid order with its money split out, for the organiser's accounts. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { event } = await requirePermission(slug, can.manageEvent);
  const orders = await prisma.order.findMany({
    where: { eventId: event.id, provider: { not: 'free' }, status: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] } },
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { registrations: true } } },
  });
  const m = (n: number, c: string) => (isCurrency(c) ? fromMinor(n, c) : n / 100);
  const lines = [
    csvLine(['Invoice', 'Paid at (UTC)', 'Buyer', 'Email', 'Tickets', 'Currency', 'Subtotal', 'Discount', 'VAT', 'Booking fee', 'Fee paid by', 'Buyer paid', 'Card processing', 'Refunded', 'Your share', 'Status', 'Provider reference']),
    ...orders.map((o) => {
      const share = o.subtotalMinor - o.discountMinor + o.vatMinor - (o.feePassedOn ? 0 : o.feeMinor) - o.processingMinor - o.refundedMinor;
      return csvLine([
        invoiceNumber(o), (o.paidAt ?? o.createdAt).toISOString(), o.buyerName, o.buyerEmail, o._count.registrations, o.currency,
        m(o.subtotalMinor, o.currency), m(o.discountMinor, o.currency), m(o.vatMinor, o.currency), m(o.feeMinor, o.currency),
        o.feePassedOn ? 'Buyer' : 'Organiser', m(o.totalMinor, o.currency), m(o.processingMinor, o.currency), m(o.refundedMinor, o.currency), m(share, o.currency), o.status, o.providerRef ?? '',
      ]);
    }),
  ];
  return new Response('﻿' + lines.join('\r\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${slug}-orders.csv"` },
  });
}
