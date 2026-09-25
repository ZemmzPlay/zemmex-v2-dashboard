import Link from 'next/link';
import { prisma } from '@zemmz/db';
import { formatDate, formatMoney } from '@zemmz/shared';
import { fmt, pct } from '@/lib/format';
import { PLAN_GRACE_DAYS, planDef, PLANS, TRIAL_ATTENDEES, type PlanDef } from '@/lib/plans';
import { daysLeft, eventsThisYear, planQuote, purchaseInvoiceNumber } from '@/lib/billing';
import { paymentsReady } from '@/lib/payments';
import { PlanButtons } from './plan-buttons';
import { buyPlan, requestActivation } from './actions';

const TZ = 'Asia/Dubai';

const NOTICE: Record<string, [string, string]> = {
  paid: ['ok', 'Payment received. Your plan is active and the tax invoice is below.'],
  failed: ['err', 'The payment didn’t go through and nothing was charged. Try again, or ask for an invoice.'],
  cancelled: ['info', 'Payment cancelled. Nothing was charged.'],
  pending: ['info', 'The payment provider hasn’t confirmed the payment yet. Refresh in a minute; don’t pay twice.'],
};

/** The plan, what's used, and paying for it by card or by invoice. */
export async function PlanTab({ organisationId, manage, payment }: { organisationId: string; manage: boolean; payment?: string }) {
  const [org, attendees, yearEvents, allEvents, biggest, pending, purchases] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: organisationId } }),
    prisma.registration.count({ where: { status: 'CONFIRMED', event: { organisationId } } }),
    eventsThisYear(organisationId),
    prisma.event.count({ where: { organisationId } }),
    prisma.event.findMany({ where: { organisationId }, select: { name: true, _count: { select: { registrations: { where: { status: 'CONFIRMED' } } } } } }),
    prisma.contactRequest.findFirst({ where: { kind: 'UPGRADE', handledAt: null, message: { contains: organisationId } }, orderBy: { createdAt: 'desc' } }),
    prisma.planPurchase.findMany({ where: { organisationId, status: 'PAID' }, orderBy: { createdAt: 'desc' } }),
  ]);
  const plan = planDef(org.plan);
  const largest = biggest.reduce((m, e) => Math.max(m, e._count.registrations), 0);
  const status = { TRIAL: ['Free trial', 'b-info'], ACTIVE: ['Active', 'b-ok'], SUSPENDED: ['Paused', 'b-danger'] }[org.planStatus];
  const left = daysLeft(org);
  const cards = paymentsReady();
  const notice = payment ? NOTICE[payment] : undefined;

  const offer = (p: PlanDef, label?: string) => {
    const q = planQuote(p.key, org.country);
    return (
      <div className="opt-card !cursor-default" key={p.key}>
        <b>{p.name}</b>
        <small>{p.price} {p.per}{q?.vatMinor ? ' + VAT' : ''}</small>
        <small>{p.blurb}</small>
        <div className="mt-2">
          {q ? (
            <PlanButtons plan={p.key} cards={cards} payLabel={label ?? `Pay ${formatMoney(q.totalMinor, q.currency)} by card`} buy={buyPlan} invoice={requestActivation} />
          ) : (
            <Link href="/contact?about=enterprise" className="btn secondary sm">Talk to us</Link>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-[860px]">
      {notice && <div className={`notice ${notice[0]} mb-4`} role="status">{notice[1]}</div>}
      <section className="fsec">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="m-0 text-[15px] font-semibold">{plan.name}</h2>
          <span className={`badge ${status[1]}`}>{status[0]}</span>
          <span className="ml-auto text-[13px] text-muted">{plan.price} {plan.per}, excluding VAT</span>
        </div>
        <p className="mb-4 mt-1 text-[13px] text-muted">{plan.blurb}</p>
        {org.planStatus === 'TRIAL' && (
          <>
            <div className="mb-1 flex justify-between text-[13px]"><span>Attendees on the free trial</span><b>{fmt(attendees)} of {TRIAL_ATTENDEES}</b></div>
            <span className="prog block !h-2"><i style={{ width: `${Math.min(100, pct(attendees, TRIAL_ATTENDEES))}%`, background: attendees >= TRIAL_ATTENDEES ? 'var(--danger)' : undefined }} /></span>
            <p className="mb-0 mt-3 text-[13px] text-ink-2">
              {attendees >= TRIAL_ATTENDEES ? 'The trial is full, so new registrations are paused on your event websites. Choose a plan to open them again.' : 'Everything works during the trial. When it’s full, new registrations pause until you choose a plan.'}
            </p>
          </>
        )}
        {org.planStatus === 'ACTIVE' && (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13.5px]">
            {org.planEndsAt && (
              <li>
                {left != null && left < 0
                  ? <b className="text-danger">Ended on {formatDate(org.planEndsAt, TZ)}. Registrations stay open until {formatDate(new Date(org.planEndsAt.getTime() + PLAN_GRACE_DAYS * 86_400_000), TZ)}; renew to keep them open.</b>
                  : <>Paid until {formatDate(org.planEndsAt, TZ)}{left != null && left <= 30 ? <b className="text-warn"> · {left} {left === 1 ? 'day' : 'days'} left</b> : null}</>}
              </li>
            )}
            {org.plan === 'EVENT'
              ? <li>{fmt(allEvents)} of {fmt(org.eventCredits)} paid {org.eventCredits === 1 ? 'event' : 'events'} used{allEvents >= org.eventCredits ? ' · buy another to create a new one' : ''}</li>
              : <li>{fmt(yearEvents)} {yearEvents === 1 ? 'event' : 'events'} in the last 12 months{plan.events ? ` of ${plan.events} included` : ', unlimited'}</li>}
            <li>Largest event: {fmt(largest)} attendees{plan.attendees ? ` of ${fmt(plan.attendees)} included` : ''}{plan.attendees && largest > plan.attendees ? <b className="text-danger"> · over the plan, we’ll be in touch about moving to Season</b> : null}</li>
          </ul>
        )}
        {org.planStatus === 'SUSPENDED' && <p className="m-0 text-[13px] text-danger">Your account is paused, so registrations are closed on your event websites. Choose a plan below to reopen them straight away.</p>}
      </section>

      {manage && (
        <section className="fsec">
          {org.planStatus === 'ACTIVE' ? (
            <>
              <h2>{left != null && left <= 60 ? 'Renew' : 'Change or add'}</h2>
              <p className="hint">{cards ? 'Pay by card and it applies straight away, or ask for an invoice to pay by bank transfer.' : 'We’ll email an invoice; it applies as soon as it’s paid.'}</p>
              <div className="opt-cards">
                {org.plan === 'EVENT' && offer(planDef('EVENT'), undefined)}
                {org.plan !== 'ENTERPRISE' && offer(planDef('SEASON'), org.plan === 'SEASON' ? `Renew for a year, ${formatMoney(planQuote('SEASON', org.country)!.totalMinor, 'AED')}` : undefined)}
                {offer(planDef('ENTERPRISE'))}
              </div>
            </>
          ) : pending && !cards ? (
            <div className="notice info">You asked us to activate the {planDef(pending.plan ?? org.plan).name} plan. We’ll email the invoice; the plan starts when it’s paid.</div>
          ) : (
            <>
              <h2>Choose a plan</h2>
              <p className="hint">{cards ? 'Pay by card and your plan starts straight away. Prefer a bank transfer? Ask for an invoice.' : 'We’ll email an invoice. Your plan starts as soon as it’s paid, and nothing you’ve set up changes.'}</p>
              {pending && <div className="notice info mb-3">You’ve asked for an invoice for the {planDef(pending.plan ?? org.plan).name} plan. It’s on its way; you can also pay by card now.</div>}
              <div className="opt-cards">{PLANS.map((p) => offer(p))}</div>
            </>
          )}
        </section>
      )}

      {purchases.length > 0 && (
        <section className="fsec">
          <h2>Billing history</h2>
          <div className="card overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Date</th><th>Plan</th><th className="num">Paid</th><th>Invoice</th></tr></thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id}>
                    <td>{formatDate(p.paidAt ?? p.createdAt, TZ)}</td>
                    <td>{planDef(p.plan).name}{p.periodEnd ? <span className="muted"> · until {formatDate(p.periodEnd, TZ)}</span> : null}</td>
                    <td className="num">{formatMoney(p.totalMinor, p.currency)}</td>
                    <td><Link href={`/organisation/billing/${p.id}`}>{purchaseInvoiceNumber(p)}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

