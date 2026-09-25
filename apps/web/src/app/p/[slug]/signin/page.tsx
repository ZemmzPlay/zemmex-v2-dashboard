import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { siteFor } from '@/lib/play/site';
import { currentPlayer } from '@/lib/play/players';
import { startSignIn } from '../actions';
import { SiteForm } from '../site-form';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return { title: (await siteFor((await params).slug)).t.signin, robots: { index: false } };
}

export default async function SignIn({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ next?: string; new?: string }> }) {
  const { slug } = await params;
  const { next = '', new: isNew } = await searchParams;
  const { project, t, locale, base } = await siteFor(slug);
  if (await currentPlayer(project.id)) redirect(next.startsWith(base) ? next : `${base}/me`);
  return (
    <div className="wrap">
      <SiteForm action={startSignIn.bind(null, slug)} className="auth" submit={t.sendCode} pendingLabel={locale === 'ar' ? 'جارٍ الإرسال…' : 'Sending…'}>
        <h1>{isNew ? t.join : t.signin}</h1>
        <p className="sub">{t.signinSub}</p>
        <input type="hidden" name="next" value={next} />
        <div className="fld">
          <label htmlFor="target">{t.target}</label>
          <input id="target" name="target" className="inp" dir="ltr" autoComplete="email" required autoFocus placeholder="name@example.com · +965 5000 0000" />
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{t.targetHint}</span>
        </div>
      </SiteForm>
    </div>
  );
}
