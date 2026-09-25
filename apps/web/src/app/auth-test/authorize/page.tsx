import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

export const metadata: Metadata = { title: 'Test sign-in', robots: { index: false } };

/** A stand-in identity provider for development (SSO_TEST=1). Never in production. */
export default async function TestAuthorize({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  if (process.env.SSO_TEST !== '1' || process.env.NODE_ENV === 'production') notFound();
  const q = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-6">
      <form method="post" action="/auth-test/submit" className="card w-full max-w-[400px] p-6">
        <input type="hidden" name="state" value={q.state ?? ''} />
        <input type="hidden" name="nonce" value={q.nonce ?? ''} />
        <p className="m-0 text-[12px] font-bold tracking-[.08em] text-muted">TEST IDENTITY PROVIDER</p>
        <h1 className="mb-4 mt-2 text-[22px] font-bold">Sign in as</h1>
        <div className="fld"><label htmlFor="t-email">Email address</label><input id="t-email" name="email" type="email" className="inp" required defaultValue={q.login_hint ?? ''} /></div>
        <div className="fld"><label htmlFor="t-name">Full name</label><input id="t-name" name="name" className="inp" /></div>
        <label className="mb-4 flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="verified" defaultChecked /> The provider vouches for this email</label>
        <button className="btn primary w-full">Continue</button>
      </form>
    </main>
  );
}
