import type { Metadata } from 'next';
import { prisma } from '@zemmz/db';
import { requireUser, ROLE_LABEL } from '@/lib/auth';
import { SimpleForm } from '@/components/simple-form';
import { DashboardShell } from '@/components/shell/dashboard-shell';
import { changePassword, disconnectIdentity, saveProfile, signOutEverywhereElse } from './actions';
import { ssoLabel, ssoProviders } from '@/lib/sso';

export const metadata: Metadata = { title: 'Your account' };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ sso?: string; sso_error?: string }> }) {
  const user = await requireUser();
  const q = await searchParams;
  const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { identities: { orderBy: { createdAt: 'asc' } } } });
  const providers = ssoProviders();
  const sessions = await prisma.authSession.count({ where: { userId: user.id, expiresAt: { gt: new Date() } } });
  return (
    <DashboardShell user={user}>
      <div className="ph"><div><h1>Your account</h1><p>{user.email} · {ROLE_LABEL[user.role]} at {user.organisationName}</p></div></div>
      <div className="max-w-[760px]">
        <SimpleForm action={saveProfile} submitLabel="Save" canEdit>
          <section className="fsec">
            <h2>Profile</h2>
            <p className="hint">Your name appears in the activity log and on invitations you send. To use a different email, ask an owner to invite it.</p>
            <div className="fld !mb-0"><label htmlFor="a-name">Name</label><input id="a-name" name="name" className="inp" defaultValue={user.name} required maxLength={120} autoComplete="name" /></div>
          </section>
        </SimpleForm>
        <div className="mt-6">
          <SimpleForm action={changePassword} submitLabel="Change password" canEdit>
            <section className="fsec">
              <h2>Password</h2>
              {!row.passwordHash && <p className="hint">You sign in with {row.identities.map((i) => ssoLabel(i.provider)).join(' or ')}. Set a password to be able to sign in with your email too.</p>}
              <div className="grid gap-x-4 sm:grid-cols-2">
                {row.passwordHash ? <div className="fld !mb-0"><label htmlFor="a-cur">Current password</label><input id="a-cur" name="current" type="password" className="inp" autoComplete="current-password" required /></div> : null}
                <div className="fld !mb-0"><label htmlFor="a-new">New password</label><input id="a-new" name="password" type="password" className="inp" autoComplete="new-password" required /><span className="help">At least 8 characters, with a number.</span></div>
              </div>
            </section>
          </SimpleForm>
        </div>
        {(providers.length > 0 || row.identities.length > 0) && (
          <section className="fsec mt-6">
            <h2>Microsoft and Google</h2>
            <p className="hint">Sign in with a work account instead of your password.</p>
            {q.sso === 'linked' && <div className="notice ok mb-3" role="status">Connected. You can sign in with it from now on.</div>}
            {q.sso_error && <div className="notice err mb-3" role="alert">{q.sso_error.slice(0, 300)}</div>}
            <ul className="m-0 mb-3 flex list-none flex-col gap-2 p-0">
              {row.identities.map((i) => (
                <li key={i.id} className="flex items-center gap-3 rounded-xl border border-line p-3 text-[13.5px]">
                  <b>{ssoLabel(i.provider)}</b><span className="flex-1 text-muted">{i.email}</span>
                  {(row.passwordHash || row.identities.length > 1) && (
                    <form action={disconnectIdentity}><input type="hidden" name="id" value={i.id} /><button className="btn ghost sm">Disconnect</button></form>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              {providers.filter((p) => !row.identities.some((i) => i.provider === p.key)).map((p) => (
                <a key={p.key} className="btn secondary" href={`/auth/${p.key}/start?intent=link&email=${encodeURIComponent(user.email)}`}>Connect {p.label}</a>
              ))}
            </div>
          </section>
        )}
        <section className="fsec mt-6">
          <h2>Signed-in devices</h2>
          <p className="hint">You’re signed in on {sessions} {sessions === 1 ? 'device' : 'devices'}, including this one.</p>
          {sessions > 1 && <form action={signOutEverywhereElse}><button className="btn secondary">Sign out everywhere else</button></form>}
        </section>
      </div>
    </DashboardShell>
  );
}
