import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@zemmz/db';
import { formatMoney, formatShortDateTime } from '@zemmz/shared';
import { can, requireUser, ROLE_LABEL } from '@/lib/auth';
import { ROLE_NOTE } from '@/lib/accounts';
import { relativeTime } from '@/lib/format';
import { Avatar } from '@/components/avatar';
import { ConfirmButton } from '@/components/confirm-button';
import { FormDialog } from '@/components/form-dialog';
import { Icon } from '@/components/icon';
import { SimpleForm } from '@/components/simple-form';
import { DashboardShell } from '@/components/shell/dashboard-shell';
import { changeRole, invite, removeMember, resendInvite, revokeInvite, saveOrganisation, savePayoutAccount } from './actions';
import { balances, formatIban, PAYOUT_DELAY_DAYS } from '@/lib/payouts';
import { RoleSelect } from './role-select';
import { PlanTab } from './plan-tab';

export const metadata: Metadata = { title: 'Organisation' };

const KINDS = ['Event company or agency', 'Promoter', 'Company', 'Association or society', 'University', 'Hospital or medical body', 'Venue', 'Government'];
const COUNTRIES = ['United Arab Emirates', 'Saudi Arabia', 'Kuwait', 'Qatar', 'Bahrain', 'Oman', 'Egypt', 'Jordan', 'Other'];

export default async function OrganisationPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  if (!can.seeDashboard(user.role)) redirect('/events');
  const { tab = 'team' } = await searchParams;
  const manage = can.manageEvent(user.role);
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: user.organisationId } });
  const tabs: [string, string][] = [['team', 'People with access'], ['plan', 'Plan'], ['payouts', 'Payouts'], ['details', 'Details'], ['log', 'Activity']];

  return (
    <DashboardShell user={user}>
      <div className="ph"><div><h1>{org.name}</h1><p>People, plan and details for your whole organisation.</p></div></div>
      <nav className="tabs" aria-label="Organisation">
        {tabs.map(([k, l]) => <Link key={k} href={`/organisation?tab=${k}`} aria-current={tab === k ? 'page' : undefined}>{l}</Link>)}
      </nav>
      {tab === 'team' && <Team userId={user.id} role={user.role} organisationId={user.organisationId} manage={manage} />}
      {tab === 'plan' && <PlanTab organisationId={user.organisationId} manage={manage} />}
      {tab === 'details' && (
        <SimpleForm action={saveOrganisation} submitLabel="Save" canEdit={manage}>
          <section className="fsec">
            <h2>Organisation</h2>
            <p className="hint">Shown to people you invite, and on your invoices.</p>
            <div className="fld"><label htmlFor="o-name">Name</label><input id="o-name" name="name" className="inp" defaultValue={org.name} required maxLength={120} /></div>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <div className="fld !mb-0"><label htmlFor="o-kind">What best describes you</label><select id="o-kind" name="kind" className="sel" defaultValue={org.kind}><option value="">Not set</option>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></div>
              <div className="fld !mb-0"><label htmlFor="o-country">Country</label><select id="o-country" name="country" className="sel" defaultValue={org.country}><option value="">Not set</option>{COUNTRIES.map((k) => <option key={k}>{k}</option>)}</select></div>
            </div>
          </section>
          <section className="fsec">
            <h2>Tax invoices</h2>
            <p className="hint">Ticket buyers get a tax invoice from you when an event adds VAT. Leave empty if you aren’t registered for VAT.</p>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <div className="fld !mb-0"><label htmlFor="o-legal">Legal name<span className="opt">optional</span></label><input id="o-legal" name="legalName" className="inp" defaultValue={org.legalName} maxLength={160} placeholder={org.name} /></div>
              <div className="fld !mb-0"><label htmlFor="o-vat">VAT number (TRN)<span className="opt">optional</span></label><input id="o-vat" name="vatNumber" className="inp" defaultValue={org.vatNumber} maxLength={30} /></div>
            </div>
          </section>
        </SimpleForm>
      )}
      {tab === 'payouts' && <Payouts organisationId={user.organisationId} manage={manage} timezone={DEFAULT_TZ} />}
      {tab === 'log' && <OrgLog organisationId={user.organisationId} />}
    </DashboardShell>
  );
}

async function Team({ userId, role, organisationId, manage }: { userId: string; role: string; organisationId: string; manage: boolean }) {
  const [members, invites] = await Promise.all([
    prisma.membership.findMany({ where: { organisationId }, include: { user: true }, orderBy: { createdAt: 'asc' } }),
    prisma.invitation.findMany({ where: { organisationId, acceptedAt: null }, orderBy: { createdAt: 'desc' } }),
  ]);
  const roleOptions = (Object.keys(ROLE_LABEL) as (keyof typeof ROLE_LABEL)[]).filter((r) => role === 'OWNER' || r !== 'OWNER').map((r) => [r, ROLE_LABEL[r]] as [string, string]);
  const now = new Date();
  return (
    <>
      <div className="toolbar">
        <p className="m-0 max-w-[70ch] grow text-ink-2">Owners and admins manage everything. Content editors manage registrations, messages and the website. Check-in staff only see the check-in console.</p>
        {manage && (
          <FormDialog action={invite} label={<><Icon name="plus" size={16} /> Invite</>} className="btn primary" title="Invite someone" submitLabel="Send invitation">
            <div className="fld"><label htmlFor="inv-email">Email</label><input id="inv-email" name="email" type="email" className="inp" required autoFocus placeholder="colleague@organisation.com" /></div>
            <fieldset className="m-0 border-0 p-0">
              <legend className="mb-2 text-[13px] font-medium text-ink-2">Role</legend>
              <div className="opt-cards !grid-cols-1">
                {roleOptions.map(([r, l], i) => (
                  <label className="opt-card" key={r}>
                    <input type="radio" name="role" value={r} className="sr-only" defaultChecked={r === 'CHECKIN' || (i === 0 && !roleOptions.some(([x]) => x === 'CHECKIN'))} />
                    <b>{l}</b><small>{ROLE_NOTE[r as keyof typeof ROLE_NOTE]}</small>
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="mb-0 mt-3 text-[12.5px] text-muted">They get an email with a link that works for 7 days.</p>
          </FormDialog>
        )}
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Name</th><th>Role</th><th>Last active</th>{manage && <th className="text-right">Action</th>}</tr></thead>
          <tbody>
            {members.map((m) => {
              const self = m.userId === userId;
              const locked = self || (role !== 'OWNER' && m.role === 'OWNER');
              return (
                <tr key={m.id}>
                  <td><div className="flex items-center gap-2.5"><Avatar name={m.user.name} size={30} /><div><b className="font-semibold">{m.user.name}{self && <span className="muted"> (you)</span>}</b><div className="muted">{m.user.email}</div></div></div></td>
                  <td>{manage && !locked ? <RoleSelect value={m.role} options={roleOptions} action={changeRole.bind(null, m.id)} label={`Role for ${m.user.name}`} /> : <span className="tag">{ROLE_LABEL[m.role]}</span>}</td>
                  <td className="muted">{m.user.lastSeenAt ? relativeTime(m.user.lastSeenAt) : 'Not yet'}</td>
                  {manage && (
                    <td className="text-right">
                      {!locked && (
                        <ConfirmButton action={removeMember} hidden={{ id: m.id }} label="Remove" className="btn danger-ghost sm" title={`Remove ${m.user.name}?`} body={`${m.user.name} loses access straight away and is signed out on every device. Their name stays in the activity log.`} confirmLabel="Remove access" />
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {invites.length > 0 && (
        <>
          <h2 className="mb-3 mt-6 text-[15px] font-semibold">Invitations not accepted yet</h2>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Email</th><th>Role</th><th>Status</th>{manage && <th className="text-right">Action</th>}</tr></thead>
              <tbody>
                {invites.map((i) => (
                  <tr key={i.id}>
                    <td>{i.email}<div className="muted">Invited by {i.invitedByLabel || 'someone'} {relativeTime(i.createdAt)}</div></td>
                    <td><span className="tag">{ROLE_LABEL[i.role]}</span></td>
                    <td>{i.expiresAt < now ? <span className="badge b-warn">Expired</span> : <span className="badge b-info">Sent</span>}</td>
                    {manage && (
                      <td className="whitespace-nowrap text-right">
                        <span className="inline-flex gap-2">
                          <form action={resendInvite}><input type="hidden" name="id" value={i.id} /><button className="btn secondary sm">Send again</button></form>
                          <ConfirmButton action={revokeInvite} hidden={{ id: i.id }} label="Cancel" className="btn danger-ghost sm" title={`Cancel the invitation to ${i.email}?`} body="The link in their email stops working." confirmLabel="Cancel invitation" />
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

async function OrgLog({ organisationId }: { organisationId: string }) {
  const rows = await prisma.activityLog.findMany({ where: { organisationId }, orderBy: { createdAt: 'desc' }, take: 300, include: { event: { select: { name: true } } } });
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr><th>When (UTC)</th><th>Who</th><th>What</th><th>Event</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="muted whitespace-nowrap">{formatShortDateTime(r.createdAt, 'UTC')}</td>
              <td className="whitespace-nowrap font-semibold">{r.actorLabel}</td>
              <td>{r.action}</td>
              <td className="muted">{r.event?.name ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const DEFAULT_TZ = 'Asia/Dubai';

async function Payouts({ organisationId, manage, timezone }: { organisationId: string; manage: boolean; timezone: string }) {
  const [org, bals, history] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: organisationId } }),
    balances(organisationId),
    prisma.payout.findMany({ where: { organisationId }, orderBy: { createdAt: 'desc' }, take: 50 }),
  ]);
  return (
    <div className="max-w-[860px]">
      <p className="mt-0 text-[13.5px] text-muted">
        Buyers pay zemmz, and zemmz pays your share into your bank account every week: ticket prices and VAT, less refunds, card processing at cost, and the booking fee on events where you absorb it. Money from each order is held {PAYOUT_DELAY_DAYS} days first, so refunds come out of it.
      </p>
      {bals.length === 0 ? (
        <div className="card mb-6 p-6 text-center text-muted">No paid tickets yet. Your balance shows here after the first sale.</div>
      ) : (
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          {bals.map((b) => (
            <div className="card kpi" key={b.currency}>
              <div className="l">{b.currency} owed to you</div>
              <div className="v">{formatMoney(b.balanceMinor, b.currency)}</div>
              <div className="d">{formatMoney(b.availableMinor, b.currency)} ready for the next payout · {formatMoney(b.paidOutMinor, b.currency)} paid so far</div>
            </div>
          ))}
        </div>
      )}
      <SimpleForm action={savePayoutAccount} submitLabel="Save bank details" canEdit={manage}>
        <section className="fsec">
          <h2>Bank account</h2>
          <p className="hint">{org.payoutIban ? `Payouts go to the account ending ${org.payoutIban.slice(-4)}.` : 'Add the account payouts should go to. Nothing can be paid out until you do.'}</p>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <div className="fld"><label htmlFor="p-name">Name on the account</label><input id="p-name" name="accountName" className="inp" defaultValue={org.payoutAccountName || org.legalName || org.name} maxLength={120} /></div>
            <div className="fld"><label htmlFor="p-bank">Bank</label><input id="p-bank" name="bankName" className="inp" defaultValue={org.payoutBankName} maxLength={120} /></div>
            <div className="fld !mb-0"><label htmlFor="p-iban">IBAN</label><input id="p-iban" name="iban" className="inp font-mono" defaultValue={formatIban(org.payoutIban)} maxLength={42} autoComplete="off" /></div>
            <div className="fld !mb-0"><label htmlFor="p-swift">SWIFT code<span className="opt">optional</span></label><input id="p-swift" name="swift" className="inp font-mono uppercase" defaultValue={org.payoutSwift} maxLength={11} autoComplete="off" /></div>
          </div>
        </section>
      </SimpleForm>
      <h2 className="mb-2 mt-8 text-[15px] font-semibold">Payouts</h2>
      {history.length === 0 ? (
        <p className="text-muted">None yet.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Date</th><th className="num">Amount</th><th>Reference</th></tr></thead>
            <tbody>
              {history.map((p) => (
                <tr key={p.id}><td>{formatShortDateTime(p.createdAt, timezone)}</td><td className="num">{formatMoney(p.amountMinor, p.currency)}</td><td>{p.reference || '—'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
