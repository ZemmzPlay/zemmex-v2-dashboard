import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { AuthShell } from '@/components/auth-shell';
import { LoginForm } from './login-form';
import { SsoButtons } from '@/components/sso-buttons';
import { ssoProviders } from '@/lib/sso';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string; sso_error?: string; sso?: string }> }) {
  if (await getCurrentUser()) redirect('/events');
  const { next, reset, sso_error, sso } = await searchParams;
  return (
    <AuthShell>
      <h1>Welcome back</h1>
      <p className="lead">Sign in to manage your events.</p>
      {reset && <div className="notice ok" role="status">Your password has changed. Sign in with the new one.</div>}
      {sso_error && <div className="notice err" role="alert">{sso_error.slice(0, 300)}</div>}
      {sso === 'unavailable' && <div className="notice err" role="alert">That sign-in option isn’t set up. Sign in with your email and password.</div>}
      <LoginForm next={next ?? ''} />
      <SsoButtons providers={ssoProviders()} next={next} />
      <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 14, margin: '20px 0 0' }}>
        New to zemmz Live? <Link href="/signup" className="linkbtn">Start a free trial</Link>
      </p>
      {process.env.NODE_ENV !== 'production' && (
        <div className="notice info" style={{ marginTop: 20, fontSize: 13 }}>
          <b>Local demo accounts:</b> owner@zemmz.test, editor@zemmz.test, desk@zemmz.test. Password zemmz-demo-2026 (set by the seed).
        </div>
      )}
    </AuthShell>
  );
}
