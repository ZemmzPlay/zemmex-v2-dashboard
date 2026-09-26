import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@zemmz/db';
import { formatDate, formatMoney } from '@zemmz/shared';
import { requireUser } from '@/lib/auth';
import { purchaseInvoiceNumber } from '@/lib/billing';
import { planDef, zemmzSeller } from '@/lib/plans';
import { PROVIDER_LABEL, type ProviderName } from '@/lib/payments';
import { PrintButton } from './print-button';

export const metadata: Metadata = { title: 'Invoice' };

/** zemmz's tax invoice for a plan paid by card. */
export default async function PlanInvoice({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const p = await prisma.planPurchase.findFirst({ where: { id, organisationId: user.organisationId, status: 'PAID' }, include: { organisation: true } });
  if (!p) notFound();
  const seller = zemmzSeller();
  const org = p.organisation;
  const money = (n: number) => formatMoney(n, p.currency);
  const tz = 'Asia/Dubai';
  return (
    <main className="mx-auto max-w-[760px] p-6 sm:p-10">
      <div className="card p-6 sm:p-8 print:border-0 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[22px] font-extrabold tracking-[-.04em]">zemmz <span className="text-[10px] font-bold tracking-[.12em] text-muted">LIVE</span></div>
            <h1 className="m-0 mt-3 text-[24px] font-bold">{p.vatMinor ? 'Tax invoice' : 'Invoice'}</h1>
            <p className="m-0 mt-1 text-[13.5px] text-muted">Number <b>{purchaseInvoiceNumber(p)}</b> · Issued {formatDate(p.paidAt ?? p.createdAt, tz)}</p>
          </div>
          <PrintButton />
        </div>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 text-[13.5px]">
          <div>
            <div className="text-[12px] font-bold uppercase tracking-[.06em] text-muted">From</div>
            <b>{seller.name}</b><div>{seller.address}</div>{seller.vatNumber && <div>VAT number: {seller.vatNumber}</div>}
          </div>
          <div>
            <div className="text-[12px] font-bold uppercase tracking-[.06em] text-muted">To</div>
            <b>{org.legalName || org.name}</b>{org.country && <div>{org.country}</div>}{org.vatNumber && <div>VAT number: {org.vatNumber}</div>}
          </div>
        </div>
        <table className="tbl mt-6">
          <thead><tr><th>Item</th><th className="num">Amount</th></tr></thead>
          <tbody>
            <tr><td>{planDef(p.plan).product === 'play' ? 'zemmz Play ' : ''}{planDef(p.plan).name} plan{planDef(p.plan).product === 'play' ? `, ${p.months === 12 ? '12 months' : `${p.months} month${p.months === 1 ? '' : 's'}`}` : ''}{p.plan === 'EVENT' ? ', one event' : ''}{p.periodEnd ? `, until ${formatDate(p.periodEnd, tz)}` : ''}</td><td className="num">{money(p.amountMinor)}</td></tr>
            <tr><td>{p.vatMinor ? 'VAT (5%)' : 'VAT (0%, outside the UAE)'}</td><td className="num">{money(p.vatMinor)}</td></tr>
            <tr><td><b>Total paid</b></td><td className="num"><b>{money(p.totalMinor)}</b></td></tr>
          </tbody>
        </table>
        <p className="mb-0 mt-4 text-[12.5px] text-muted">Paid by card through {PROVIDER_LABEL[p.provider as ProviderName] ?? p.provider}{p.providerRef ? `, reference ${p.providerRef}` : ''}.</p>
      </div>
    </main>
  );
}
