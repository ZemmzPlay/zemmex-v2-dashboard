import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@zemmz/db';
import { eventType, formatShortDateTime } from '@zemmz/shared';
import { can, requirePermission } from '@/lib/auth';
import { registrationWhere, SORTS, type SortKey } from '@/lib/registration-query';
import { an, fmt, fullName } from '@/lib/format';
import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { SearchBox } from '@/components/search-box';
import { UrlSelect } from '@/components/url-select';

export const metadata: Metadata = { title: 'Registrations' };
const PAGE = 25;

type SP = Promise<{ q?: string; show?: string; ticket?: string; f1?: string; sort?: string; page?: string }>;

export default async function RegistrationsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SP }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { user, event } = await requirePermission(slug, can.seeDashboard);
  const TY = eventType(event.type);
  const sort: SortKey = sp.sort && sp.sort in SORTS ? (sp.sort as SortKey) : 'newest';
  const page = Math.max(1, Number(sp.page) || 1);
  const where = registrationWhere(event.id, sp, event.timezone);

  const [total, rows, tickets, all, f1s] = await Promise.all([
    prisma.registration.count({ where }),
    prisma.registration.findMany({
      where,
      orderBy: SORTS[sort],
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: { ticketType: { select: { name: true } }, _count: { select: { attendance: true } } },
    }),
    prisma.ticketType.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
    prisma.registration.count({ where: { eventId: event.id, status: 'CONFIRMED' } }),
    prisma.registration.groupBy({ by: ['field1'], where: { eventId: event.id, status: 'CONFIRMED', field1: { not: '' } }, orderBy: { field1: 'asc' }, take: 60 }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (p: number) => {
    const n = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    n.set('page', String(p));
    return `?${n.toString()}`;
  };
  const filtered = !!(sp.q || sp.show || sp.ticket || sp.f1);
  const exportHref = `/events/${slug}/registrations/export?${new URLSearchParams(Object.entries({ q: sp.q, show: sp.show, ticket: sp.ticket, f1: sp.f1 }).filter(([, v]) => v) as [string, string][])}`;

  return (
    <>
      <div className="ph">
        <div>
          <h1>{TY.regs}</h1>
          <p>{fmt(all)} {all === 1 ? TY.one : TY.regs.toLowerCase()} · IDs are unique and never reused</p>
        </div>
        <div className="actions">
          <a href={exportHref} className="btn secondary"><Icon name="download" size={16} /> Export CSV</a>
          {can.editRegistrations(user.role) && (
            <Link href={`/events/${slug}/registrations/new`} className="btn primary"><Icon name="plus" size={16} /> {TY.register}</Link>
          )}
        </div>
      </div>

      <div className="toolbar">
        <SearchBox label={`Find ${an(TY.guest)}`} placeholder={`Find ${an(TY.guest)} by name, ID, email or mobile`} />
        <UrlSelect
          param="show"
          label="Show"
          value={sp.show ?? ''}
          options={[['', `All ${TY.guests}`], ['checked_in', 'Checked in'], ['not_checked_in', 'Not checked in yet'], ['today', TY.gates ? 'Bought today' : 'Registered today'], ['no_badge', `${TY.badge[0].toUpperCase() + TY.badge.slice(1)} not printed`], ['cancelled', 'Cancelled']]}
        />
        {tickets.length > 1 && <UrlSelect param="ticket" label="Ticket" value={sp.ticket ?? ''} options={[['', 'Any ticket'], ...tickets.map((t) => [t.id, t.name] as [string, string])]} />}
        {f1s.length > 1 && TY.f1 !== 'Ticket' && <UrlSelect param="f1" label={TY.f1} value={sp.f1 ?? ''} options={[['', `All ${TY.f1s}`], ...f1s.map((f) => [f.field1, f.field1] as [string, string])]} />}
        <UrlSelect param="sort" label="Sort by" value={sort} options={[['newest', 'Newest first'], ['oldest', 'Oldest first'], ['name', 'Last name, A–Z']]} />
      </div>

      <div className="tbl-wrap">
        {rows.length === 0 ? (
          <div className="empty">
            <div className="ic"><Icon name="search" size={24} /></div>
            <h3>{filtered ? 'No one matches' : `No ${TY.guests} yet`}</h3>
            <p>{filtered ? 'Try another name, ID or email, or clear the filters.' : `${TY.regs} from the website appear here as they come in.`}</p>
            {filtered && <Link className="btn secondary" href={`/events/${slug}/registrations`}>Clear search and filters</Link>}
          </div>
        ) : (
          <>
            <form id="bulk" action={`/events/${slug}/registrations/print`} className="flex flex-wrap items-center gap-3 border-b border-line px-3.5 py-2.5">
              <span className="text-[12.5px] text-muted">Tick people to print their {TY.badge}s together.</span>
              <button className="btn secondary sm ml-auto"><Icon name="print" size={15} /> Print selected</button>
            </form>
            <table className="tbl">
              <caption className="sr-only">{TY.regs}, page {page} of {pages}</caption>
              <thead>
                <tr>
                  <th scope="col" className="w-10"><span className="sr-only">Select</span></th>
                  <th scope="col">ID</th>
                  <th scope="col">Name</th>
                  <th scope="col">{TY.f1}</th>
                  <th scope="col">{tickets.length > 1 && TY.f1 !== 'Ticket' ? 'Ticket' : TY.f2}</th>
                  <th scope="col">Attendance</th>
                  <th scope="col">Registered</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.status === 'CONFIRMED' && <input type="checkbox" form="bulk" name="id" value={r.publicId} aria-label={`Select ${fullName(r)}`} className="h-4 w-4 accent-[var(--brand)]" />}</td>
                    <td className="tabular-nums">{r.publicId}</td>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={`${r.firstName} ${r.lastName}`} size={30} shape={TY.shape} />
                        <div className="min-w-0">
                          <Link href={`/events/${slug}/registrations/${r.publicId}`} className="rowlink">{fullName(r)}</Link>
                          <div className="muted truncate">{r.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>{r.field1 || <span className="muted">—</span>}</td>
                    <td className="max-w-[220px] truncate">{tickets.length > 1 && TY.f1 !== 'Ticket' ? r.ticketType?.name ?? '—' : r.field2 || '—'}</td>
                    <td>
                      {r.status === 'CANCELLED' ? <span className="badge b-danger">Cancelled</span>
                        : r._count.attendance > 0 ? <span className="badge b-ok">{TY.gates ? 'Came in' : `${r._count.attendance} ${r._count.attendance === 1 ? TY.unit.toLowerCase() : TY.units}`}</span>
                        : <span className="badge b-neutral">Not yet</span>}
                    </td>
                    <td className="muted whitespace-nowrap">{formatShortDateTime(r.createdAt, event.timezone)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <nav className="pager" aria-label="Pages">
              <span>{fmt((page - 1) * PAGE + 1)}–{fmt(Math.min(page * PAGE, total))} of {fmt(total)}</span>
              <span className="pg">
                <Link href={qs(page - 1)} aria-disabled={page <= 1} aria-label="Previous page"><Icon name="chevl" size={14} /></Link>
                <span className="cur" aria-current="page">{page}</span>
                <span className="self-center px-1">of {pages}</span>
                <Link href={qs(page + 1)} aria-disabled={page >= pages} aria-label="Next page"><Icon name="chevr" size={14} /></Link>
              </span>
            </nav>
          </>
        )}
      </div>
    </>
  );
}
