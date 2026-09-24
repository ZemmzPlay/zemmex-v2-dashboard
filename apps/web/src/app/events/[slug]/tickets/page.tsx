import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@zemmz/db';
import { CURRENCIES, TICKET_FEE, eventType, formatMoney, isCurrency } from '@zemmz/shared';
import { can, requirePermission } from '@/lib/auth';
import { an, fmt, pct } from '@/lib/format';
import { Icon } from '@/components/icon';
import { ActionSwitch } from '@/components/action-switch';
import { ConfirmButton } from '@/components/confirm-button';
import { FormDialog } from '@/components/form-dialog';
import { createPromoCode, deleteTicketType, saveTicketType, setPromoActive, setTicketOnSale } from './actions';

export const metadata: Metadata = { title: 'Tickets' };

export default async function TicketsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { slug } = await params;
  const { tab = 'types' } = await searchParams;
  const { user, event } = await requirePermission(slug, can.seeDashboard);
  const TY = eventType(event.type);
  const edit = can.manageEvent(user.role);
  const base = `/events/${slug}/tickets`;

  const [types, soldBy, promos, revenue] = await Promise.all([
    prisma.ticketType.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: 'asc' }, include: { _count: { select: { registrations: true, gates: true } } } }),
    prisma.registration.groupBy({ by: ['ticketTypeId'], where: { eventId: event.id, status: 'CONFIRMED' }, _count: true }),
    prisma.promoCode.findMany({ where: { eventId: event.id }, orderBy: { code: 'asc' } }),
    prisma.order.aggregate({ where: { eventId: event.id, status: 'PAID' }, _sum: { subtotalMinor: true, discountMinor: true } }),
  ]);
  const sold = (id: string) => soldBy.find((s) => s.ticketTypeId === id)?._count ?? 0;
  const totalSold = soldBy.reduce((t, s) => t + s._count, 0);
  const unlimited = types.some((t) => t.capacity == null);
  const totalCap = types.reduce((t, x) => t + (x.capacity ?? 0), 0);
  const paid = types.some((t) => t.priceMinor > 0);
  const takings = (revenue._sum.subtotalMinor ?? 0) - (revenue._sum.discountMinor ?? 0);
  const exp = isCurrency(event.currency) ? CURRENCIES[event.currency].exponent : 2;

  const tabs: [string, string][] = [['types', 'Ticket types'], ['promo', 'Promo codes'], ['pay', 'Payments']];

  const ticketFields = (t?: (typeof types)[number]) => (
    <>
      <div className="fld">
        <label htmlFor={`tn-${t?.id ?? 'new'}`}>Name<span className="req">*</span></label>
        <input id={`tn-${t?.id ?? 'new'}`} name="name" className="inp" defaultValue={t?.name} placeholder="For example, Early bird" required maxLength={80} autoFocus />
      </div>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <div className="fld">
          <label htmlFor={`tp-${t?.id ?? 'new'}`}>Price ({event.currency})</label>
          <input id={`tp-${t?.id ?? 'new'}`} name="price" type="number" min={0} step={1 / 10 ** exp} className="inp" defaultValue={t ? t.priceMinor / 10 ** exp : 0} />
          <span className="help">0 for free.{t && sold(t.id) ? ' Only affects tickets sold from now on.' : ''}</span>
        </div>
        <div className="fld">
          <label htmlFor={`tc-${t?.id ?? 'new'}`}>How many<span className="opt">optional</span></label>
          <input id={`tc-${t?.id ?? 'new'}`} name="capacity" type="number" min={1} step={1} className="inp" defaultValue={t ? t.capacity ?? '' : 100} />
          <span className="help">Leave empty for no limit.</span>
        </div>
      </div>
      <div className="fld !mb-0">
        <label htmlFor={`td-${t?.id ?? 'new'}`}>Description<span className="opt">optional</span></label>
        <input id={`td-${t?.id ?? 'new'}`} name="description" className="inp" defaultValue={t?.description} placeholder="What’s included" maxLength={200} />
      </div>
    </>
  );

  return (
    <>
      <div className="ph">
        <div>
          <h1>Tickets</h1>
          <p>{paid ? 'Ticket types, prices and what’s sold.' : 'Who can register, and how many places there are.'}</p>
        </div>
      </div>
      <nav className="tabs" aria-label="Tickets">
        {tabs.map(([k, l]) => <Link key={k} href={`${base}?tab=${k}`} aria-current={tab === k ? 'page' : undefined}>{l}</Link>)}
      </nav>
      {!edit && <div className="notice info mb-4">Only owners and admins can change tickets, prices and promo codes.</div>}

      {tab === 'types' && (
        <>
          <div className="mb-4 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
            <div className="card kpi">
              <div className="l">{paid ? 'Sold' : 'Registered'}</div>
              <div className="v">{fmt(totalSold)}</div>
              <div className="d">{unlimited ? 'No overall limit' : `of ${fmt(totalCap)} available`}</div>
            </div>
            <div className="card kpi">
              <div className="l">Revenue</div>
              <div className="v">{paid || takings ? formatMoney(takings, event.currency) : 'Free event'}</div>
              <div className="d">{paid || takings ? 'Paid orders, after discounts and before fees' : 'Add a paid ticket type any time'}</div>
            </div>
            <div className="card kpi">
              <div className="l">On sale</div>
              <div className="v">{types.filter((t) => t.onSale).length}</div>
              <div className="d">{event.registrationOpen ? 'The homepage is selling' : `${TY.openLbl} is off on the dashboard`}</div>
            </div>
          </div>
          {types.length ? (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Ticket</th><th>Price</th><th className="num">Sold</th><th className="w-[26%]">Capacity</th><th>On sale</th><th className="text-right">Action</th></tr></thead>
                <tbody>
                  {types.map((t) => {
                    const n = sold(t.id);
                    const p = t.capacity ? Math.min(100, pct(n, t.capacity)) : 0;
                    const deletable = !t._count.registrations && !t._count.gates;
                    return (
                      <tr key={t.id}>
                        <td><b className="font-semibold">{t.name}</b>{t.description && <div className="muted">{t.description}</div>}</td>
                        <td className="whitespace-nowrap">{formatMoney(t.priceMinor, event.currency, { freeLabel: true })}</td>
                        <td className="num">{fmt(n)}</td>
                        <td>
                          {t.capacity == null ? <span className="muted">No limit</span> : (
                            <div className="flex items-center gap-2.5">
                              <span className="prog flex-1"><i style={{ width: `${p}%`, background: p >= 95 ? 'var(--danger)' : undefined }} /></span>
                              <span className="muted whitespace-nowrap">{p}% of {fmt(t.capacity)}</span>
                            </div>
                          )}
                        </td>
                        <td><ActionSwitch checked={t.onSale} action={setTicketOnSale.bind(null, slug, t.id)} label={`${t.name} on sale`} disabled={!edit} /></td>
                        <td className="whitespace-nowrap text-right">
                          {edit && (
                            <div className="inline-flex gap-2">
                              <FormDialog action={saveTicketType.bind(null, slug, t.id)} label="Edit" className="btn secondary sm" title={`Edit ${t.name}`} submitLabel="Save">
                                {ticketFields(t)}
                              </FormDialog>
                              {deletable && (
                                <ConfirmButton
                                  action={deleteTicketType.bind(null, slug)}
                                  hidden={{ id: t.id }}
                                  label="Delete"
                                  className="btn danger-ghost sm"
                                  title={`Delete ${t.name}?`}
                                  body="Nobody holds this ticket yet. It disappears from the website straight away."
                                  confirmLabel="Delete ticket type"
                                />
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card empty"><div className="ic"><Icon name="ticket" size={24} /></div><h3>No ticket types yet</h3><p>Add one so people can register. A free event needs one free ticket type.</p></div>
          )}
          {edit && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <FormDialog action={saveTicketType.bind(null, slug, null)} label={<><Icon name="plus" size={16} /> Add ticket type</>} title="Add ticket type" submitLabel="Add ticket type">
                {ticketFields()}
              </FormDialog>
              <span className="text-[12.5px] text-muted">Ticket types that someone holds{TY.gates ? ` or ${an(TY.unit)} accepts` : ''} can’t be deleted. Take them off sale instead.</span>
            </div>
          )}
        </>
      )}

      {tab === 'promo' && (
        !promos.length && !paid ? (
          <div className="card empty"><div className="ic"><Icon name="ticket" size={24} /></div><h3>Promo codes work with paid tickets</h3><p>This event is free to attend. Add a paid ticket type first.</p></div>
        ) : (
          <>
            <div className="toolbar">
              <span className="grow text-muted">Codes visitors enter at checkout. The discount applies to every ticket in the order.</span>
              {edit && (
                <FormDialog action={createPromoCode.bind(null, slug)} label={<><Icon name="plus" size={16} /> New code</>} className="btn primary" title="New promo code" submitLabel="Create code">
                  <div className="fld">
                    <label htmlFor="pc-code">Code<span className="req">*</span></label>
                    <input id="pc-code" name="code" className="inp font-mono uppercase" placeholder="EARLYBIRD" required maxLength={20} pattern="[A-Za-z0-9\-]{3,20}" autoFocus />
                    <span className="help">3 to 20 letters, numbers or hyphens. Visitors can type it in any case.</span>
                  </div>
                  <div className="grid gap-x-4 sm:grid-cols-2">
                    <div className="fld !mb-0">
                      <label htmlFor="pc-off">Discount (%)<span className="req">*</span></label>
                      <input id="pc-off" name="percentOff" type="number" min={1} max={100} step={1} className="inp" defaultValue={10} required />
                    </div>
                    <div className="fld !mb-0">
                      <label htmlFor="pc-max">Times it can be used<span className="opt">optional</span></label>
                      <input id="pc-max" name="maxUses" type="number" min={1} step={1} className="inp" />
                      <span className="help">Leave empty for no limit.</span>
                    </div>
                  </div>
                </FormDialog>
              )}
            </div>
            {promos.length ? (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>Code</th><th>Discount</th><th className="num">Used</th><th>Active</th></tr></thead>
                  <tbody>
                    {promos.map((p) => (
                      <tr key={p.id}>
                        <td><span className="tag font-mono">{p.code}</span></td>
                        <td>{p.percentOff}% off</td>
                        <td className="num">{fmt(p.uses)}{p.maxUses != null && <span className="muted"> of {fmt(p.maxUses)}</span>}</td>
                        <td><ActionSwitch checked={p.active} action={setPromoActive.bind(null, slug, p.id)} label={`${p.code} active`} disabled={!edit} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="card empty"><div className="ic"><Icon name="ticket" size={24} /></div><h3>No promo codes yet</h3><p>Create a code for early birds, partners or speakers’ guests.</p></div>
            )}
          </>
        )
      )}

      {tab === 'pay' && <Payments currency={event.currency} />}
    </>
  );
}

function Payments({ currency }: { currency: string }) {
  const mock = (process.env.PAYMENT_PROVIDER ?? 'mock') === 'mock';
  const sched = TICKET_FEE.schedule[currency as keyof typeof TICKET_FEE.schedule];
  const exp = isCurrency(currency) ? CURRENCIES[currency].exponent : 2;
  return (
    <div className="max-w-[760px]">
      <section className="fsec">
        <h2>Card payments</h2>
        <p className="hint">Money from ticket sales goes to your account through the payment provider.</p>
        <div className="flex items-center gap-3.5 rounded-xl border border-line p-3.5">
          <span className="proj-mark" style={{ background: mock ? 'var(--warn)' : 'var(--ok)' }}>Pay</span>
          <div className="flex-1">
            <b>{mock ? 'Test payments only' : 'Card payments connected'}</b>
            <div className="text-[12.5px] text-muted">
              {mock
                ? process.env.NODE_ENV === 'production'
                  ? 'No payment provider is set up, so paid checkouts are refused and nothing is charged.'
                  : 'The checkout asks whether to approve or decline a test payment. No card details are collected.'
                : `Charged in ${currency}.`}
            </div>
          </div>
          <span className={`badge ${mock ? 'b-warn' : 'b-ok'}`}>{mock ? 'Not connected' : 'Connected'}</span>
        </div>
      </section>
      <section className="fsec">
        <h2>Ticket fee</h2>
        <p className="hint">Free tickets cost nothing. Paid tickets carry a platform fee, added to the price the buyer pays.</p>
        <p className="m-0 text-[13.5px]">
          {(TICKET_FEE.rate * 100).toFixed(1)}% of the ticket price after discounts
          {sched ? <>, plus {formatMoney(Math.round(sched.fixed * 10 ** exp), currency)}, capped at {formatMoney(Math.round(sched.cap * 10 ** exp), currency)} per ticket.</> : '.'}
        </p>
        <p className="mb-0 mt-2 text-[12.5px] text-muted">Card processing is charged separately by the payment provider. Refunds are made with the provider; cancelling a registration here doesn’t refund it.</p>
      </section>
    </div>
  );
}
