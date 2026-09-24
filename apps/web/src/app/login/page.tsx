import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect('/events');
  const { next } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 py-10">
      <div className="w-full max-w-[400px]">
        <p className="mb-6 text-center text-[30px] font-extrabold tracking-[-0.04em] text-ink">
          zemmz<span className="ml-1.5 align-middle text-[10px] font-bold tracking-[0.12em] text-muted">LIVE</span>
        </p>
        <div className="card p-6">
          <h1 className="m-0 text-xl font-bold">Sign in to your dashboard</h1>
          <p className="mb-5 mt-1 text-[13px] text-muted">Use the email your organisation invited.</p>
          <LoginForm next={next ?? ''} />
        </div>
        {process.env.NODE_ENV !== 'production' && (
          <div className="notice info mt-4 flex-col !gap-1 text-ink">
            <b>Local demo accounts</b>
            <span>owner@zemmz.test · editor@zemmz.test · desk@zemmz.test</span>
            <span>Password: zemmz-demo-2026 (set by the seed)</span>
          </div>
        )}
      </div>
    </main>
  );
}
