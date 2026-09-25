import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@zemmz/db';
import { AuthShell } from '@/components/auth-shell';
import { findInvitation, ROLE_NOTE } from '@/lib/accounts';
import { getCurrentUser, ROLE_LABEL } from '@/lib/auth';
import { AuthForm } from '../../auth-form';
import { acceptInvitation } from '../../account-actions';

export const metadata: Metadata = { title: 'Accept your invitation', robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await findInvitation(token);
  if (!inv) {
    return (
      <AuthShell>
        <h1>This invitation has expired</h1>
        <p className="lead">Invitations work for 7 days and only once. Ask the person who invited you to send a new one.</p>
        <Link href="/login" className="btn primary">Go to sign in</Link>
      </AuthShell>
    );
  }
  const [existing, current] = await Promise.all([prisma.user.findUnique({ where: { email: inv.email } }), getCurrentUser()]);
  const signedInAsThem = current && existing && current.id === existing.id;
  return (
    <AuthShell>
      <h1>Join {inv.organisation.name}</h1>
      <p className="lead">{inv.invitedByLabel || 'Someone'} invited <b>{inv.email}</b> as {ROLE_LABEL[inv.role].toLowerCase()}. {ROLE_NOTE[inv.role]}.</p>
      {current && !signedInAsThem && <div className="notice info">You’re signed in as {current.email}. Accepting signs you in as {inv.email} instead.</div>}
      <AuthForm action={acceptInvitation.bind(null, token)} submitLabel={`Join ${inv.organisation.name}`}>
        {signedInAsThem ? null : existing ? (
          <div className="fld">
            <label htmlFor="password">Your zemmz Live password</label>
            <input id="password" name="password" type="password" className="inp" autoComplete="current-password" required autoFocus />
            <span className="help">You already have an account with this email. <Link href="/forgot" className="linkbtn">Forgot it?</Link></span>
          </div>
        ) : (
          <>
            <div className="fld">
              <label htmlFor="name">Full name</label>
              <input id="name" name="name" className="inp" autoComplete="name" required autoFocus maxLength={120} />
            </div>
            <div className="fld">
              <label htmlFor="password">Choose a password</label>
              <input id="password" name="password" type="password" className="inp" autoComplete="new-password" required />
              <span className="help">At least 8 characters, with a number.</span>
            </div>
          </>
        )}
      </AuthForm>
    </AuthShell>
  );
}
