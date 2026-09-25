import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { AuthShell } from '@/components/auth-shell';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  if (await getCurrentUser()) redirect('/events');
  const { next, reset } = await searchParams;
  return (
    <AuthShell>
      <h1>Welcome back</h1>
      <p className="lead">Sign in to manage your events.</p>
      {reset && <div className="notice ok" role="status">Your password has changed. Sign in with the new one.</div>}
      <LoginForm next={next ?? ''} />
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
