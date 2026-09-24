import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@zemmz/db';
import { formatShortDateTime } from '@zemmz/shared';
import { isPlatformAdmin, requireUser } from '@/lib/auth';
import { fmt } from '@/lib/format';
import { PLANS, planDef, TRIAL_ATTENDEES } from '@/lib/plans';
import { DashboardShell } from '@/components/shell/dashboard-shell';
import { FormDialog } from '@/components/form-dialog';
import { markHandled, setPlan } from './actions';

export const metadata: Metadata = { title: 'zemmz admin', robots: { index: false } };

/** For zemmz staff (PLATFORM_ADMIN_EMAILS): every organisation's plan, and requests from the website. */
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  if (!isPlatformAdmin(user.email)) notFound();
  const { tab = 'orgs' } = await searchParams;
  const tabs: [string, string][] = [['orgs', 'Organisations'], ['requests', 'Requests']];
  const open = await prisma.contactRequest.count({ where: { handledAt: null } });

  return (
    <DashboardShell user={user}>
      <div className="ph"><div><h1>zemmz admin</h1><p>Plans are invoiced, then activated here. Only people in PLATFORM_ADMIN_EMAILS see this page.</p></div></div>
      <nav className="tabs" aria-label="Admin">
        {tabs.map(([k, l]) => <Link key={k} href={`/admin?tab=${k}`} aria-current={tab === k ? 'page' : undefined}>{l}{k === 'requests' && open ? ` · ${open}` : ''}</Link>)}
      </nav>
      {tab === 'orgs' ? <Orgs /> : <Requests />}
    </DashboardShell>
  );
}

async function Orgs() {
  const orgs = await prisma.organisation.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { events: true, memberships: true } }, memberships: { where: { role: 'OWNER' }, include: { user: { select: { email: true } } }, take: 1 } },
  });
  const counts = await prisma.$queryRaw<{ organisationId: string; n: bigint }[]>`
    SELECT e."organisationId", COUNT(*) AS n FROM "Registration" r JOIN "Event" e ON e.id = r."eventId" WHERE r.status = 'CONFIRMED' GROUP BY 1`;
  const attendees = new Map(counts.map((c) => [c.organisationId, Number(c.n)]));
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr><th>Organisation</th><th>Plan</th><th>Status</th><th className="num">Attendees</th><th className="num">Events</th><th>Since</th><th className="text-right">Action</th></tr></thead>
        <tbody>
          {orgs.map((o) => {
            const n = attendees.get(o.id) ?? 0;
            return (
              <tr key={o.id}>
                <td><b className="font-semibold">{o.name}</b><div className="muted">{o.memberships[0]?.user.email ?? 'No owner'} · {[o.kind, o.country].filter(Boolean).join(' · ')}</div></td>
                <td>{planDef(o.plan).name}</td>
                <td><span className={`badge ${o.planStatus === 'ACTIVE' ? 'b-ok' : o.planStatus === 'TRIAL' ? 'b-info' : 'b-danger'}`}>{o.planStatus === 'TRIAL' ? 'Trial' : o.planStatus === 'ACTIVE' ? 'Active' : 'Paused'}</span></td>
                <td className="num">{fmt(n)}{o.planStatus === 'TRIAL' && <span className="muted"> / {TRIAL_ATTENDEES}</span>}</td>
                <td className="num">{o._count.events}</td>
                <td className="muted whitespace-nowrap">{formatShortDateTime(o.createdAt, 'UTC')}</td>
                <td className="text-right">
                  <FormDialog action={setPlan.bind(null, o.id)} label="Change" className="btn secondary sm" title={`Plan for ${o.name}`} submitLabel="Save">
                    <div className="fld"><label htmlFor={`p-${o.id}`}>Plan</label><select id={`p-${o.id}`} name="plan" className="sel" defaultValue={o.plan}>{PLANS.map((p) => <option key={p.key} value={p.key}>{p.name} · {p.price} {p.per}</option>)}</select></div>
                    <div className="fld !mb-0"><label htmlFor={`s-${o.id}`}>Status</label><select id={`s-${o.id}`} name="planStatus" className="sel" defaultValue={o.planStatus}><option value="TRIAL">Free trial ({TRIAL_ATTENDEES} attendees)</option><option value="ACTIVE">Active: invoice paid</option><option value="SUSPENDED">Paused: registrations closed</option></select><span className="help">Activating emails the owners.</span></div>
                  </FormDialog>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

async function Requests() {
  const rows = await prisma.contactRequest.findMany({ orderBy: [{ handledAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }], take: 200 });
  if (!rows.length) return <div className="card empty"><h3>No requests yet</h3><p>Demo, contact and plan requests from the website appear here.</p></div>;
  const kind = { DEMO: 'Demo', CONTACT: 'Contact', UPGRADE: 'Plan' } as const;
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr><th>When (UTC)</th><th>Type</th><th>From</th><th>Message</th><th className="text-right">Status</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="muted whitespace-nowrap">{formatShortDateTime(r.createdAt, 'UTC')}</td>
              <td><span className="tag">{kind[r.kind]}{r.plan ? ` · ${planDef(r.plan).name}` : ''}</span></td>
              <td><b className="font-semibold">{r.name || r.email}</b><div className="muted"><a href={`mailto:${r.email}`}>{r.email}</a>{r.organisation && ` · ${r.organisation}`}</div></td>
              <td className="max-w-[360px] whitespace-pre-line text-[13px]">{r.message || <span className="muted">—</span>}</td>
              <td className="text-right">{r.handledAt ? <span className="badge b-neutral">Handled</span> : <form action={markHandled}><input type="hidden" name="id" value={r.id} /><button className="btn secondary sm">Mark handled</button></form>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
