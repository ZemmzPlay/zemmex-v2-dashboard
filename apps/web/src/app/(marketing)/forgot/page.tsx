import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth-shell';
import { AuthForm } from '../auth-form';
import { requestReset } from '../account-actions';

export const metadata: Metadata = { title: 'Reset your password' };

export default function ForgotPage() {
  return (
    <AuthShell>
      <h1>Reset your password</h1>
      <p className="lead">Enter the email you sign in with. We’ll send a link to choose a new password.</p>
      <AuthForm action={requestReset} submitLabel="Send the link" hideOnSuccess>
        <div className="fld">
          <label htmlFor="email">Work email</label>
          <input id="email" name="email" type="email" className="inp" autoComplete="email" required autoFocus />
        </div>
      </AuthForm>
      <p style={{ textAlign: 'center', fontSize: 14, margin: '20px 0 0' }}><Link href="/login" className="linkbtn">Back to sign in</Link></p>
    </AuthShell>
  );
}
