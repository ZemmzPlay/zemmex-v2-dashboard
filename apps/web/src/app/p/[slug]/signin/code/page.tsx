import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { unsealData } from '@/lib/order-tokens';
import { siteFor } from '@/lib/play/site';
import { resendCode, verifySignIn } from '../../actions';
import { SiteForm } from '../../site-form';

export const metadata: Metadata = { robots: { index: false } };

export default async function Code({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { project, t, locale, base } = await siteFor(slug);
  const raw = (await cookies()).get('zplay_pending')?.value;
  const p = raw ? unsealData<{ p: string; target: string }>('zplay_pending', raw) : null;
  if (!p || p.p !== project.id) redirect(`${base}/signin`);
  return (
    <div className="wrap">
      <SiteForm action={verifySignIn.bind(null, slug)} className="auth" submit={t.verify} pendingLabel={locale === 'ar' ? 'جارٍ التحقق…' : 'Checking…'}>
        <h1>{t.codeT}</h1>
        <p className="sub">{t.codeSub(p.target)}</p>
        <div className="fld">
          <label htmlFor="code">{t.code}</label>
          <input id="code" name="code" className="inp code-inp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} required autoFocus />
        </div>
      </SiteForm>
      <div style={{ maxWidth: 440, margin: '-24px auto 48px', display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', fontSize: 14 }}>
        <SiteForm action={resendCode.bind(null, slug)} submit={t.resend} pendingLabel="…" full={false} className="resend" />
        <Link href={`${base}/signin`} style={{ alignSelf: 'center' }}>{t.otherTarget}</Link>
      </div>
    </div>
  );
}
