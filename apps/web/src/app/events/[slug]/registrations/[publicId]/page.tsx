import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@zemmz/db';
import { creditsEarned, eventType, formatMoney, formatShortDateTime, formatTime, minutesInRoom, shortTitle, lowerFirst } from '@zemmz/shared';
import { can, requirePermission } from '@/lib/auth';
import { initialValues, loadFormFields } from '@/lib/form-fields';
import { fullName } from '@/lib/format';
import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { ConfirmButton } from '@/components/confirm-button';
import { PersonForm } from '@/components/person-form';
import { SessionBadge } from '@/components/status';
import { cancelRegistration, resend, restoreRegistration, updateRegistration } from '../actions';
import { refundOrder } from '../../tickets/actions';
import { ConfirmAction } from '@/components/confirm-action';
import { invoiceNumber } from '@/lib/orders';

export const metadata: Metadata = { title: 'Registration' };

export default async function RegistrationPage({ params, searchParams }: { params: Promise<{ slug: string; publicId: string }>; searchParams: Promise<{ added?: string; resent?: string }> }) {
  const { slug, publicId: pid } = await params;
  const sp = await searchParams;
  const { user, event } = await requirePermission(slug, can.seeDashboard);
  const publicId = Number(pid);
  if (!Number.isSafeInteger(publicId)) notFound();
  const TY = eventType(event.type);

  const reg = await prisma.registration.findUnique({
    where: { eventId_publicId: { eventId: event.id, publicId } },
    include: { ticketType: true, order: true, certificate: true, evaluation: { select: { submittedAt: true } }, attendance: { orderBy: { inAt: 'asc' } } },
  });
  if (!reg) notFound();
  const [sessions, form] = await Promise.all([
    prisma.session.findMany({ where: { eventId: event.id }, orderBy: [{ startsAt: 'asc' }, { sortOrder: 'asc' }] }),
    loadFormFields(event.id, event.currency, { forOrganiser: true }),
  ]);

  const now = new Date();
  const policy = { rule: event.creditRule, thresholdPct: event.creditThresholdPct };
  const rows = sessions.map((s) => {
    const iv = reg.attendance.filter((a) => a.sessionId === s.id);
    const sl = { id: s.id, title: s.title, startsAt: s.startsAt, endsAt: s.endsAt, capacity: s.capacity, credits: s.credits };
    return { s, iv, minutes: minutesInRoom(sl, iv, now), earned: TY.credits ? creditsEarned(sl, iv, policy, now) : 0 };
  });
  const attendedCount = rows.filter((r) => r.iv.length).length;
  const points = rows.reduce((t, r) => t + (r.earned ?? 0), 0);
  const pendingPoints = rows.some((r) => r.earned === null);
  const cancelled = reg.status !== 'CONFIRMED';
  const refundable = !!reg.order && reg.paidMinor > 0 && !reg.refundedAt && reg.status === 'CONFIRMED' && can.manageEvent(user.role) && (reg.order.status === 'PAID' || reg.order.status === 'PARTIALLY_REFUNDED');
  const editable = can.editRegistrations(user.role);
  const name = fullName(reg);

  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href={`/events/${slug}/registrations`}>{TY.regs}</Link> <Icon name="chevr" size={12} /> <span>{TY.idName} {reg.publicId}</span>
      </nav>
      <div className="ph">
        <div className="flex items-center gap-4">
          <Avatar name={`${reg.firstName} ${reg.lastName}`} size={56} shape={TY.shape} />
          <div>
            <h1>{name}</h1>
            <p>
              {TY.idName} {reg.publicId} · {reg.ticketType?.name ?? TY.guest} · registered {formatShortDateTime(reg.createdAt, event.timezone)}
              {reg.source !== 'WEBSITE' && ` · added ${reg.source === 'DASHBOARD' ? 'from the dashboard' : 'by import'}`}
            </p>
          </div>
        </div>
        <div className="actions">
          {!cancelled && (
            <Link href={`/events/${slug}/registrations/${reg.publicId}/badge`} className="btn secondary"><Icon name="print" size={16} /> Print {TY.badge}</Link>
          )}
          {editable && !cancelled && (
            <form action={resend.bind(null, slug, reg.publicId)}>
              <button className="btn secondary"><Icon name="mail" size={16} /> Resend confirmation</button>
            </form>
          )}
        </div>
      </div>

      {sp.added && <div className="notice ok mb-4" role="status">{name} was added with {lowerFirst(TY.idName)} {reg.publicId}. A confirmation email is on its way to {reg.email}.</div>}
      {sp.resent && <div className="notice ok mb-4" role="status">The confirmation email was queued for {reg.email}.</div>}
      {cancelled && <div className="notice err mb-4" role="status">This {TY.one} is cancelled. The ID is refused at check-in and can’t claim anything after the event.</div>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          <section className="card mb-4" aria-labelledby="att-h">
            <div className="card-h">
              <h2 id="att-h">Attendance</h2>
              <span className="sub">{attendedCount} of {sessions.length} {TY.units}{TY.credits && ` · ${points}${pendingPoints ? '+' : ''} CME points`}</span>
            </div>
            <div className="card-b !pt-3">
              <table className="tbl !min-w-0">
                <thead><tr><th>{TY.unit}</th><th>In and out</th><th className="num">Minutes</th>{TY.credits && <th className="num">Points</th>}</tr></thead>
                <tbody>
                  {rows.map(({ s, iv, minutes, earned }) => (
                    <tr key={s.id}>
                      <td>
                        <div className="font-semibold">{shortTitle(s.title)}</div>
                        <div className="muted">{formatShortDateTime(s.startsAt, event.timezone)}–{formatTime(s.endsAt, event.timezone)} <SessionBadge status={s.status} gates={TY.gates} /></div>
                      </td>
                      <td className="text-[13px] tabular-nums">
                        {iv.length === 0 ? <span className="muted">—</span> : iv.map((a) => (
                          <div key={a.id}>{formatTime(a.inAt, event.timezone)} → {a.outAt ? formatTime(a.outAt, event.timezone) : s.status === 'LIVE' ? <b className="text-ok">in the room</b> : <span className="text-warn">no scan out</span>}</div>
                        ))}
                      </td>
                      <td className="num">{iv.length ? minutes ?? '…' : ''}</td>
                      {TY.credits && <td className="num">{s.credits ? (earned === null ? <span className="muted">earning</span> : earned ? earned : <span className="muted">0 of {s.credits}</span>) : ''}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
              {TY.credits && (
                <p className="mt-3 mb-0 text-[12.5px] text-muted">
                  {event.creditRule === 'duration' ? `Points need ${event.creditThresholdPct}% of a session in the room, from scans in and out.` : 'Points are earned by checking in to a session.'}
                  {event.requireEvaluation && ` The evaluation must be submitted before the certificate. ${reg.evaluation ? 'Submitted.' : 'Not submitted yet.'}`}
                </p>
              )}
            </div>
          </section>

          {editable && !cancelled && (
            <section aria-labelledby="edit-h">
              <h2 id="edit-h" className="mb-3 mt-6 text-[15px] font-semibold">Details</h2>
              <PersonForm action={updateRegistration.bind(null, slug, reg.publicId)} fields={form.fields} tickets={form.tickets} initial={initialValues(reg)} submitLabel="Save changes" />
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <section className="card card-b">
            <h2 className="mt-0 mb-3 text-[15px] font-semibold">Contact</h2>
            <dl className="m-0 grid grid-cols-[90px_1fr] gap-y-2 text-[13.5px]">
              <dt className="text-muted">Email</dt><dd className="m-0 break-all"><a href={`mailto:${reg.email}`}>{reg.email}</a></dd>
              <dt className="text-muted">Mobile</dt><dd className="m-0">{reg.mobile || '—'}</dd>
              <dt className="text-muted">{TY.f1}</dt><dd className="m-0">{reg.field1 || '—'}</dd>
              <dt className="text-muted">{TY.f2}</dt><dd className="m-0">{reg.field2 || '—'}</dd>
              <dt className="text-muted">{TY.badge[0].toUpperCase() + TY.badge.slice(1)}</dt><dd className="m-0">{reg.badgePrintedAt ? `Printed ${formatShortDateTime(reg.badgePrintedAt, event.timezone)}` : 'Not printed'}</dd>
              {reg.order && reg.order.provider !== 'free' && (<><dt className="text-muted">Order</dt><dd className="m-0"><Link href={`/events/${slug}/tickets/orders/${reg.order.id}`}>{invoiceNumber(reg.order)}</Link> · {reg.refundedAt ? `refunded ${formatMoney(reg.paidMinor, reg.order.currency)}` : `paid ${formatMoney(reg.paidMinor, reg.order.currency)}`}</dd></>)}
            </dl>
          </section>
          {editable && !reg.refundedAt && reg.status !== 'PENDING' && (
            <section className="card card-b">
              <h2 className="mt-0 mb-1 text-[15px] font-semibold">{cancelled ? `Restore this ${TY.one}` : `Cancel this ${TY.one}`}</h2>
              <p className="mt-0 mb-3 text-[12.5px] text-muted">
                {cancelled ? 'The ID will work again at check-in.' : `The ID stops working at check-in and after the event.${refundable ? ` Refunding returns ${formatMoney(reg.paidMinor, reg.order!.currency)} to the buyer’s card.` : ''}`}
              </p>
              {cancelled ? (
                <form action={restoreRegistration.bind(null, slug, reg.publicId)}><button className="btn secondary">Restore {TY.one}</button></form>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {refundable && (
                    <ConfirmAction
                      action={refundOrder.bind(null, slug, reg.order!.id, [reg.id])}
                      label={<>Refund and cancel</>}
                      title={`Refund ${formatMoney(reg.paidMinor, reg.order!.currency)} and cancel ${TY.one} ${reg.publicId}?`}
                      body={<p className="m-0">{name} won’t be able to check in or claim anything after the event, and {reg.order!.buyerName} gets {formatMoney(reg.paidMinor, reg.order!.currency)} back on their card with an email. This can’t be undone.</p>}
                      confirmLabel="Refund and cancel"
                    />
                  )}
                  <ConfirmButton
                    action={cancelRegistration.bind(null, slug, reg.publicId)}
                    label={<><Icon name="trash" size={16} /> {refundable ? 'Cancel without refund' : `Cancel ${TY.one}`}</>}
                    title={`Cancel ${TY.one} ${reg.publicId}?`}
                    body={<p className="m-0">{name} won’t be able to check in, and can’t claim a certificate or recordings. Their attendance so far is kept.{refundable ? ' Nothing is refunded.' : ''} You can restore it later.</p>}
                    confirmLabel={`Cancel ${TY.one}`}
                  />
                </div>
              )}
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
