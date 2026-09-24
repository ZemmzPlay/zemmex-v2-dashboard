import type { Metadata } from 'next';
import { prisma } from '@zemmz/db';
import { requireUser, ROLE_LABEL } from '@/lib/auth';
import { SimpleForm } from '@/components/simple-form';
import { DashboardShell } from '@/components/shell/dashboard-shell';
import { changePassword, saveProfile, signOutEverywhereElse } from './actions';

export const metadata: Metadata = { title: 'Your account' };

export default async function AccountPage() {
  const user = await requireUser();
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
              <div className="grid gap-x-4 sm:grid-cols-2">
                <div className="fld !mb-0"><label htmlFor="a-cur">Current password</label><input id="a-cur" name="current" type="password" className="inp" autoComplete="current-password" required /></div>
                <div className="fld !mb-0"><label htmlFor="a-new">New password</label><input id="a-new" name="password" type="password" className="inp" autoComplete="new-password" required /><span className="help">At least 8 characters, with a number.</span></div>
              </div>
            </section>
          </SimpleForm>
        </div>
        <section className="fsec mt-6">
          <h2>Signed-in devices</h2>
          <p className="hint">You’re signed in on {sessions} {sessions === 1 ? 'device' : 'devices'}, including this one.</p>
          {sessions > 1 && <form action={signOutEverywhereElse}><button className="btn secondary">Sign out everywhere else</button></form>}
        </section>
      </div>
    </DashboardShell>
  );
}
