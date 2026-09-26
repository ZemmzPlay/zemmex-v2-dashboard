import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@zemmz/db';
import { formatDate, formatMoney } from '@zemmz/shared';
import { can, requireUser } from '@/lib/auth';
import { playAccess, playQuote, PLAY_KEEP_DAYS } from '@/lib/play/billing';
import { PLAY_PLANS } from '@/lib/plans';
import { purchaseInvoiceNumber } from '@/lib/billing';
import { paymentsReady } from '@/lib/payments';
import { fmt } from '@/lib/format';
import { DashboardShell } from '@/components/shell/dashboard-shell';
import { BuyButton } from './buy-button';
import { buyPlayPlan } from '../actions';

export const metadata: Metadata = { title: 'zemmz Play plan' };

const TZ = 'Asia/Dubai';

export default async function PlayPlan({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const user = await requireUser();
  const { payment } = await searchParams;
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: user.organisationId } });
  const [access, websites, players, purchases] = await Promise.all([
    playAccess(org),
    prisma.playProject.count({ where: { organisationId: org.id, archivedAt: null } }),
    prisma.playPlayer.count({ where: { project: { organisationId: org.id } } }),
    prisma.planPurchase.findMany({ where: { organisationId: org.id, plan: { in: ['PLAY_CLUB', 'PLAY_SEASON', 'PLAY_PUBLISHER'] }, status: 'PAID' }, orderBy: { createdAt: 'desc' } }),
  ]);
  const manage = can.manageEvent(user.role);
  const cards = paymentsReady();
  const current = access.plan ? PLAY_PLANS.find((p) => p.key === access.plan) : null;
  const status = {
    none: 'No plan yet. Your first website starts a 14-day free trial of Season.',
    trial: `Free trial of Season until ${access.endsAt ? formatDate(access.endsAt, TZ) : ''}. Choose a plan before then to keep your websites online.`,
    active: `${current?.name} until ${access.endsAt ? formatDate(access.endsAt, TZ) : ''}. Paying again adds time from that date.`,
    lapsed: `Your ${current ? `${current.name} plan` : 'trial'} ended${access.endsAt ? ` on ${formatDate(access.endsAt, TZ)}` : ''}. Your websites are offline and nothing is deleted for ${PLAY_KEEP_DAYS} days. Choose a plan to bring them back.`,
  }[access.state];

  return (
    <DashboardShell user={user} product="play">
      <div className="ph"><div><h1>zemmz Play plan</h1><p>Tournament websites are billed separately from zemmz Live. Prices exclude VAT where it applies.</p></div></div>
      {payment === 'paid' && <div className="notice ok mb-4" role="status">Payment received. Your plan is active and the tax invoice is below.</div>}
      {payment === 'failed' && <div className="notice err mb-4" role="alert">The payment didn’t go through and nothing was charged. Try again, or use another card.</div>}
      {payment === 'cancelled' && <div className="notice info mb-4" role="status">Payment cancelled. Nothing was charged.</div>}
      {payment === 'pending' && <div className="notice info mb-4" role="status">We’re waiting for the payment provider to confirm. This page updates when it does.</div>}
      <section className={`card card-b mb-4 ${access.state === 'lapsed' ? '!border-danger' : ''}`}>
        <h2 className="m-0 mb-1 text-[15px] font-semibold">Where you are</h2>
        <p className="m-0 text-[14px]">{status}</p>
        <p className="m-0 mt-2 text-[13px] text-muted">{fmt(websites)} {websites === 1 ? 'website' : 'websites'}{access.websites != null ? ` of ${access.websites}` : ''} · {fmt(players)} players{access.players != null && access.players > 0 ? ` of ${fmt(access.players)}` : ''}</p>
      </section>
      <div className="grid gap-4 md:grid-cols-3">
        {PLAY_PLANS.map((p) => {
          const month = playQuote(p.key, 1, org.country);
          const year = playQuote(p.key, 12, org.country);
          return (
            <section key={p.key} className={`card flex flex-col ${access.plan === p.key && access.state === 'active' ? '!border-brand' : ''}`}>
              <div className="card-b flex flex-1 flex-col gap-2">
                <div className="flex items-center justify-between"><h2 className="m-0 text-[16px] font-semibold">{p.name}</h2>{access.plan === p.key && access.state === 'active' && <span className="badge b-ok">Your plan</span>}</div>
                <p className="m-0 text-[24px] font-bold">{p.price}<span className="text-[13px] font-normal text-muted"> {p.per}</span></p>
                {p.yearlyPerMonthMinor && <p className="m-0 text-[12.5px] text-muted">{formatMoney(p.yearlyPerMonthMinor, 'AED')} a month when paid yearly</p>}
                <p className="m-0 flex-1 text-[13.5px] text-ink-2">{p.blurb}</p>
                {manage && month && year ? (
                  cards ? (
                    <div className="mt-2 grid gap-2">
                      <BuyButton action={buyPlayPlan} plan={p.key} months={12} label={`Pay ${formatMoney(year.totalMinor, year.currency)} for a year`} primary />
                      <BuyButton action={buyPlayPlan} plan={p.key} months={1} label={`Pay ${formatMoney(month.totalMinor, month.currency)} for a month`} />
                    </div>
                  ) : <p className="m-0 mt-2 text-[12.5px] text-muted">Card payments aren’t set up on this server. <Link href="/contact?about=play">Ask us for an invoice</Link>.</p>
                ) : !month ? <Link href="/contact?about=play" className="btn secondary mt-2">Talk to us</Link> : null}
              </div>
            </section>
          );
        })}
      </div>
      {purchases.length > 0 && (
        <section className="card mt-4">
          <div className="card-h"><h2>Payments</h2></div>
          <div className="card-b !pt-1">
            <table className="tbl !min-w-0"><thead><tr><th>Date</th><th>Plan</th><th>Amount</th><th>Invoice</th></tr></thead>
              <tbody>{purchases.map((p) => <tr key={p.id}><td>{formatDate(p.paidAt ?? p.createdAt, TZ)}</td><td>{PLAY_PLANS.find((x) => x.key === p.plan)?.name}, {p.months === 12 ? '12 months' : `${p.months} month${p.months === 1 ? '' : 's'}`}</td><td>{formatMoney(p.totalMinor, p.currency)}</td><td><Link href={`/organisation/billing/${p.id}`}>{purchaseInvoiceNumber(p)}</Link></td></tr>)}</tbody>
            </table>
          </div>
        </section>
      )}
    </DashboardShell>
  );
}
