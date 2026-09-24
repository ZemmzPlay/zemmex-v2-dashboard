import { prisma } from '@zemmz/db';
import { formatDate } from '@zemmz/shared';
import { fmt, pct } from '@/lib/format';
import { planDef, PLANS, TRIAL_ATTENDEES } from '@/lib/plans';
import { SimpleForm } from '@/components/simple-form';
import { requestActivation } from './actions';

/** The plan, what's used, and asking zemmz to activate it. Card billing isn't built; plans are invoiced. */
export async function PlanTab({ organisationId, manage }: { organisationId: string; manage: boolean }) {
  const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
  const [org, attendees, events, biggest, pending] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: organisationId } }),
    prisma.registration.count({ where: { status: 'CONFIRMED', event: { organisationId } } }),
    prisma.event.count({ where: { organisationId, startsOn: { gte: yearStart } } }),
    prisma.event.findMany({ where: { organisationId }, select: { name: true, _count: { select: { registrations: { where: { status: 'CONFIRMED' } } } } } }),
    prisma.contactRequest.findFirst({ where: { kind: 'UPGRADE', handledAt: null, message: { contains: organisationId } }, orderBy: { createdAt: 'desc' } }),
  ]);
  const plan = planDef(org.plan);
  const largest = biggest.reduce((m, e) => Math.max(m, e._count.registrations), 0);
  const status = { TRIAL: ['Free trial', 'b-info'], ACTIVE: ['Active', 'b-ok'], SUSPENDED: ['Paused', 'b-danger'] }[org.planStatus];

  return (
    <div className="max-w-[760px]">
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
              {attendees >= TRIAL_ATTENDEES ? 'The trial is full, so new registrations are paused on your event websites. Ask us to activate your plan to open them again.' : 'Everything works during the trial. When it’s full, new registrations pause until your plan is active.'}
            </p>
          </>
        )}
        {org.planStatus === 'ACTIVE' && (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13.5px]">
            {org.activatedAt && <li>Active since {formatDate(org.activatedAt, 'UTC')}</li>}
            <li>{fmt(events)} {events === 1 ? 'event' : 'events'} this year{plan.events ? ` of ${plan.events} included` : ', unlimited'}{plan.events && events > plan.events ? <b className="text-danger"> · over the plan, we’ll be in touch</b> : null}</li>
            <li>Largest event: {fmt(largest)} attendees{plan.attendees ? ` of ${fmt(plan.attendees)} included` : ''}{plan.attendees && largest > plan.attendees ? <b className="text-danger"> · over the plan</b> : null}</li>
          </ul>
        )}
        {org.planStatus === 'SUSPENDED' && <p className="m-0 text-[13px] text-danger">Your account is paused, so registrations are closed on your event websites. Email hello@zemmz.com to reactivate it.</p>}
      </section>
      {manage && org.planStatus !== 'ACTIVE' && (
        pending ? (
          <div className="notice info">You asked us to activate the {planDef(pending.plan ?? org.plan).name} plan. We’ll send the invoice to you by email; the plan starts when it’s paid.</div>
        ) : (
          <SimpleForm action={requestActivation} submitLabel="Ask to activate this plan" canEdit>
            <section className="fsec">
              <h2>Activate a plan</h2>
              <p className="hint">We’ll email an invoice. Your plan starts as soon as it’s paid, and nothing you’ve set up changes.</p>
              <div className="opt-cards">
                {PLANS.map((p) => (
                  <label className="opt-card" key={p.key}>
                    <input type="radio" name="plan" value={p.key} className="sr-only" defaultChecked={p.key === org.plan} />
                    <b>{p.name}</b><small>{p.price} {p.per}</small><small>{p.blurb}</small>
                  </label>
                ))}
              </div>
            </section>
          </SimpleForm>
        )
      )}
    </div>
  );
}
