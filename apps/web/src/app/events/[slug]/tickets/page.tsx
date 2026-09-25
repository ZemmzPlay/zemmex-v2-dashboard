import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma, type OrderStatus, type Prisma } from '@zemmz/db';
import { CURRENCIES, TICKET_FEE, eventType, formatMoney, isCurrency } from '@zemmz/shared';
import { can, requirePermission } from '@/lib/auth';
import { an, fmt, pct } from '@/lib/format';
import { Icon } from '@/components/icon';
import { ActionSwitch } from '@/components/action-switch';
import { ConfirmButton } from '@/components/confirm-button';
import { FormDialog } from '@/components/form-dialog';
import { createPromoCode, deleteTicketType, savePaymentSettings, saveTicketType, setPromoActive, setTicketOnSale } from './actions';
import { PaymentSettings } from './payment-settings';
import { paymentProvider, paymentsReady, PROVIDER_LABEL, PROVIDER_METHODS } from '@/lib/payments';
import { invoiceNumber, TAKEN, ticketTakings } from '@/lib/orders';
import { formatShortDateTime } from '@zemmz/shared';

export const metadata: Metadata = { title: 'Tickets' };

export default async function TicketsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string; q?: string; status?: string }> }) {
  const { slug } = await params;
  const { tab = 'types', q = '', status = '' } = await searchParams;
  const { user, event } = await requirePermission(slug, can.seeDashboard);
  const TY = eventType(event.type);
  const edit = can.manageEvent(user.role);
  const base = `/events/${slug}/tickets`;

  const [types, soldBy, promos, revenue] = await Promise.all([
    prisma.ticketType.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: 'asc' }, include: { _count: { select: { registrations: true, gates: true } } } }),
    prisma.registration.groupBy({ by: ['ticketTypeId'], where: { eventId: event.id, status: 'CONFIRMED' }, _count: true }),
    prisma.promoCode.findMany({ where: { eventId: event.id }, orderBy: { code: 'asc' } }),
    prisma.order.aggregate({ where: { eventId: event.id, status: { in: [...TAKEN] } }, _sum: { subtotalMinor: true, discountMinor: true, refundedMinor: true, vatMinor: true } }),
  ]);
  const sold = (id: string) => soldBy.find((s) => s.ticketTypeId === id)?._count ?? 0;
  const totalSold = soldBy.reduce((t, s) => t + s._count, 0);
  const unlimited = types.some((t) => t.capacity == null);
  const totalCap = types.reduce((t, x) => t + (x.capacity ?? 0), 0);
  const paid = types.some((t) => t.priceMinor > 0);
  const takings = ticketTakings(revenue._sum);
  const exp = isCurrency(event.currency) ? CURRENCIES[event.currency].exponent : 2;

  const tabs: [string, string][] = [['types', 'Ticket types'], ['promo', 'Promo codes'], ...(paid ? [['orders', 'Orders'] as [string, string]] : []), ['pay', 'Payments']];

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

      {tab === 'orders' && <Orders slug={slug} eventId={event.id} timezone={event.timezone} q={q} status={status} />}
      {tab === 'pay' && (
        <Payments
          slug={slug}
          currency={event.currency}
          canEdit={edit}
          event={{ vatBps: event.vatBps, feePassedOn: event.feePassedOn, refundHours: event.refundHours }}
          hasVatNumber={!!(await prisma.organisation.findUniqueOrThrow({ where: { id: event.organisationId }, select: { vatNumber: true } })).vatNumber}
        />
      )}
    </>
  );
}

const STATUS_BADGE: Record<string, [string, string]> = {
  PAID: ['Paid', 'b-ok'],
  PENDING: ['Awaiting payment', 'b-warn'],
  FAILED: ['Not paid', 'b-neutral'],
  REFUNDED: ['Refunded', 'b-danger'],
  PARTIALLY_REFUNDED: ['Part refunded', 'b-warn'],
};

async function Orders({ slug, eventId, timezone, q, status }: { slug: string; eventId: string; timezone: string; q: string; status: string }) {
  const where: Prisma.OrderWhereInput = { eventId, provider: { not: 'free' } };
  if (status && status in STATUS_BADGE) where.status = status as OrderStatus;
  else where.status = { not: 'FAILED' };
  if (q.trim()) {
    const term = q.trim();
    where.OR = [
      { buyerName: { contains: term, mode: 'insensitive' } },
      { buyerEmail: { contains: term, mode: 'insensitive' } },
      { id: { endsWith: term.replace(/^ZL-\d{8}-/i, '').toLowerCase() } },
      ...(/^\d+$/.test(term) ? [{ registrations: { some: { publicId: Number(term) } } }] : []),
    ];
  }
  const orders = await prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100, include: { _count: { select: { registrations: true } } } });
  const base = `/events/${slug}/tickets`;
  return (
    <>
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <input type="hidden" name="tab" value="orders" />
        <input name="q" defaultValue={q} className="inp max-w-[320px]" placeholder="Buyer, email, invoice or ticket ID" aria-label="Search orders" />
        <select name="status" defaultValue={status} className="sel max-w-[200px]" aria-label="Status">
          <option value="">All but unpaid</option>
          {Object.entries(STATUS_BADGE).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button className="btn secondary">Search</button>
        <a className="btn ghost" href={`${base}/orders/export`}><Icon name="download" size={16} /> Export CSV</a>
      </form>
      {orders.length === 0 ? (
        <div className="card p-8 text-center text-muted">{q || status ? 'No orders match.' : 'No orders yet. They appear here as soon as someone buys a ticket.'}</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Invoice</th><th>Buyer</th><th className="num">Tickets</th><th className="num">Total</th><th>Status</th><th>Placed</th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td><Link href={`${base}/orders/${o.id}`} className="font-semibold">{invoiceNumber(o)}</Link></td>
                  <td>{o.buyerName}<div className="muted text-[12.5px]">{o.buyerEmail}</div></td>
                  <td className="num">{o._count.registrations}</td>
                  <td className="num">{formatMoney(o.totalMinor, o.currency)}{o.refundedMinor > 0 && <div className="text-[12px] text-danger">−{formatMoney(o.refundedMinor, o.currency)}</div>}</td>
                  <td><span className={`badge ${STATUS_BADGE[o.status][1]}`}>{STATUS_BADGE[o.status][0]}</span></td>
                  <td className="muted whitespace-nowrap">{formatShortDateTime(o.createdAt, timezone)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Payments({ slug, currency, canEdit, event, hasVatNumber }: { slug: string; currency: string; canEdit: boolean; event: { vatBps: number; feePassedOn: boolean; refundHours: number | null }; hasVatNumber: boolean }) {
  const provider = paymentProvider();
  const ready = paymentsReady();
  const mock = provider === 'mock';
  const sched = TICKET_FEE.schedule[currency as keyof typeof TICKET_FEE.schedule];
  const exp = isCurrency(currency) ? CURRENCIES[currency].exponent : 2;
  const feeText = `${(TICKET_FEE.rate * 100).toFixed(1)}% of the ticket price after discounts${sched ? `, plus ${formatMoney(Math.round(sched.fixed * 10 ** exp), currency)}, capped at ${formatMoney(Math.round(sched.cap * 10 ** exp), currency)} per ticket` : ''}. Free tickets cost nothing. Card processing is passed on at cost and comes out of your payout.`;
  return (
    <div className="max-w-[760px]">
      <section className="fsec">
        <h2>Card payments</h2>
        <p className="hint">Buyers pay on {mock ? 'a secure payment page' : `${PROVIDER_LABEL[provider]}’s secure page`}. zemmz collects the money and pays it out to your bank account every week, less card processing and, when you absorb it, the booking fee.</p>
        <div className="flex items-center gap-3.5 rounded-xl border border-line p-3.5">
          <span className="proj-mark" style={{ background: ready && !mock ? 'var(--ok)' : 'var(--warn)' }}>Pay</span>
          <div className="flex-1">
            <b>{!ready ? 'Card payments aren’t set up' : mock ? 'Test payments' : `${PROVIDER_LABEL[provider]} connected`}</b>
            <div className="text-[12.5px] text-muted">
              {!ready ? 'Paid checkouts are refused and nothing is charged until zemmz connects a payment provider.' : mock ? 'Buyers approve or decline a test payment. No card details are collected and nothing is charged.' : `${PROVIDER_METHODS[provider]} · ${currency}`}
            </div>
          </div>
          <span className={`badge ${ready && !mock ? 'b-ok' : 'b-warn'}`}>{ready && !mock ? 'Connected' : mock && ready ? 'Test mode' : 'Not connected'}</span>
        </div>
        <p className="mb-0 mt-3 text-[13px]"><Link href="/organisation?tab=payouts">Payouts and bank details</Link></p>
      </section>
      <PaymentSettings action={savePaymentSettings.bind(null, slug)} canEdit={canEdit} vatBps={event.vatBps} feePassedOn={event.feePassedOn} refundHours={event.refundHours} hasVatNumber={hasVatNumber} feeText={feeText} />
    </div>
  );
}
