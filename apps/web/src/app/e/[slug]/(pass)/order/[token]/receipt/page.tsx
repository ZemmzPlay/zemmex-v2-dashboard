import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@zemmz/db';
import { formatDate, formatMoney } from '@zemmz/shared';
import { getPublicEvent } from '@/lib/public-event';
import { siteTextFor } from '@/lib/site-locale';
import { verify } from '@/lib/order-tokens';
import { invoiceNumber } from '@/lib/orders';
import { PROVIDER_LABEL, type ProviderName } from '@/lib/payments';
import { PrintLink } from '../../../print-link';

export const metadata: Metadata = { title: 'Receipt', robots: { index: false } };

/**
 * The buyer's receipt, or a tax invoice when VAT was charged. The seller is the
 * organisation (its legal name and VAT number from Organisation, Details).
 */
export default async function ReceiptPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const event = await getPublicEvent(slug);
  const { t, locale } = await siteTextFor(event);
  const id = verify('order', token);
  const order = id
    ? await prisma.order.findFirst({
        where: { id, eventId: event.id, status: { in: ['PAID', 'REFUNDED', 'PARTIALLY_REFUNDED'] } },
        include: { registrations: { include: { ticketType: true } }, refunds: { where: { status: 'SUCCEEDED' }, orderBy: { createdAt: 'asc' } }, promoCode: true },
      })
    : null;
  if (!order || order.totalMinor === 0) notFound();
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: event.organisationId } });
  const money = (n: number) => formatMoney(n, order.currency);
  const byType = new Map<string, { name: string; qty: number; unit: number }>();
  for (const r of order.registrations) {
    const key = r.ticketTypeId ?? '-';
    const row = byType.get(key) ?? { name: r.ticketType?.name ?? '', qty: 0, unit: r.ticketType?.priceMinor ?? 0 };
    row.qty++;
    byType.set(key, row);
  }
  // Unit prices are what was charged then: subtotal split by quantity keeps the invoice true if a price changed later.
  const lines = [...byType.values()];
  const listed = lines.reduce((s, l) => s + l.unit * l.qty, 0);
  if (listed !== order.subtotalMinor && lines.length === 1) lines[0].unit = Math.round(order.subtotalMinor / lines[0].qty);
  const invoice = order.vatMinor > 0;
  const provider = PROVIDER_LABEL[order.provider as ProviderName] ?? order.provider;

  return (
    <div className="mx-auto max-w-[720px] rounded-2xl border border-[var(--line)] p-6 sm:p-8 print:border-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="m-0 text-[26px] font-bold">{invoice ? t.payment.taxInvoice : t.payment.receipt}</h1>
          <p className="m-0 mt-1 text-[13.5px] text-[var(--muted)]">{t.payment.invoiceNo} <b className="ltr">{invoiceNumber(order)}</b> · {t.payment.issued} {formatDate(order.paidAt ?? order.createdAt, event.timezone, locale)}</p>
        </div>
        <PrintLink label={t.printAll.split(' ')[0]} />
      </div>
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <div className="text-[12px] font-bold uppercase tracking-[.06em] text-[var(--muted)]">{t.payment.seller}</div>
          <b>{org.legalName || event.organiserName || org.name}</b>
          {org.vatNumber && <div className="text-[13.5px]">{t.payment.trn}: <span className="ltr">{org.vatNumber}</span></div>}
          <div className="text-[13.5px] text-[var(--ink-2)]">{event.name}</div>
        </div>
        <div>
          <div className="text-[12px] font-bold uppercase tracking-[.06em] text-[var(--muted)]">{t.payment.billedTo}</div>
          <b>{order.buyerName}</b>
          <div className="ltr text-[13.5px]">{order.buyerEmail}</div>
        </div>
      </div>
      <table className="mt-6 w-full border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-[var(--line)] text-start text-[12px] uppercase tracking-[.05em] text-[var(--muted)]">
            <th className="py-2 text-start font-bold">{t.payment.item}</th>
            <th className="py-2 text-end font-bold">{t.payment.amount}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.name} className="border-b border-[var(--line)]"><td className="py-2">{l.qty} × {l.name}</td><td className="py-2 text-end">{money(l.unit * l.qty)}</td></tr>
          ))}
          {order.discountMinor > 0 && <tr className="border-b border-[var(--line)]"><td className="py-2">{t.discount(order.promoCode?.code ?? '')}</td><td className="py-2 text-end">−{money(order.discountMinor)}</td></tr>}
          {invoice && <tr className="border-b border-[var(--line)]"><td className="py-2">{t.payment.subtotal}</td><td className="py-2 text-end">{money(order.subtotalMinor - order.discountMinor)}</td></tr>}
          {invoice && <tr className="border-b border-[var(--line)]"><td className="py-2">{t.payment.vat(`${order.vatBps / 100}%`)}</td><td className="py-2 text-end">{money(order.vatMinor)}</td></tr>}
          {order.feePassedOn && order.feeMinor > 0 && <tr className="border-b border-[var(--line)]"><td className="py-2">{t.bookingFee} (zemmz)</td><td className="py-2 text-end">{money(order.feeMinor)}</td></tr>}
          <tr><td className="py-3 font-bold">{t.total}</td><td className="py-3 text-end font-bold">{money(order.totalMinor)}</td></tr>
          {order.refunds.map((r) => (
            <tr key={r.id} className="text-[var(--danger)]"><td className="py-1">{t.payment.refunded('')} · {formatDate(r.createdAt, event.timezone, locale)}</td><td className="py-1 text-end">−{money(r.amountMinor)}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="fine mt-4">{t.payment.paidWith(provider, order.providerRef ?? '')}</p>
    </div>
  );
}
