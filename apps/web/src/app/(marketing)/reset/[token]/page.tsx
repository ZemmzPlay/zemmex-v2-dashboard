import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth-shell';
import { findReset } from '@/lib/accounts';
import { AuthForm } from '../../auth-form';
import { resetPassword } from '../../account-actions';

export const metadata: Metadata = { title: 'Choose a new password', robots: { index: false } };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await findReset(token);
  return (
    <AuthShell>
      {r ? (
        <>
          <h1>Choose a new password</h1>
          <p className="lead">For {r.user.email}. You’ll be signed out everywhere else.</p>
          <AuthForm action={resetPassword.bind(null, token)} submitLabel="Save the new password">
            <div className="fld">
              <label htmlFor="password">New password</label>
              <input id="password" name="password" type="password" className="inp" autoComplete="new-password" required autoFocus />
              <span className="help">At least 8 characters, with a number.</span>
            </div>
            <div className="fld">
              <label htmlFor="confirm">Type it again</label>
              <input id="confirm" name="confirm" type="password" className="inp" autoComplete="new-password" required />
            </div>
          </AuthForm>
        </>
      ) : (
        <>
          <h1>This link has expired</h1>
          <p className="lead">Reset links work for 2 hours and only once.</p>
          <Link href="/forgot" className="btn primary">Ask for a new link</Link>
        </>
      )}
    </AuthShell>
  );
}
