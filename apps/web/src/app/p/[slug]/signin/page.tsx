import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { siteFor } from '@/lib/play/site';
import { currentPlayer } from '@/lib/play/players';
import { PLAY_PROVIDER_LABEL, siteProviders } from '@/lib/play/oauth';
import { startSignIn } from '../actions';
import { SiteForm } from '../site-form';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return { title: (await siteFor((await params).slug)).t.signin, robots: { index: false } };
}

export default async function SignIn({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ next?: string; new?: string; error?: string; provider?: string }> }) {
  const { slug } = await params;
  const { next = '', new: isNew, error, provider } = await searchParams;
  const { project, t, locale, base } = await siteFor(slug);
  if (await currentPlayer(project.id)) redirect(next.startsWith(base) ? next : `${base}/me`);
  const email = project.signInMethods.includes('email'), phone = project.signInMethods.includes('phone');
  const providers = siteProviders(project);
  const label = email && phone ? t.target : email ? t.targetEmail : t.targetPhone;
  const err = error === 'blocked' ? t.errBlocked : error === 'unverified' ? t.errUnverified(provider === 'google' ? 'Google' : 'Discord') : error === 'expired' ? t.errExpired : null;
  return (
    <div className="wrap">
      <div className="auth">
        <h1>{isNew ? t.join : t.signin}</h1>
        <p className="sub">{email || phone ? t.signinSub : ''}</p>
        {err && <div className="notice err" role="alert">{err}</div>}
        {providers.length > 0 && (
          <div className="sso" style={{ marginBottom: email || phone ? 0 : 8 }}>
            {providers.map((p) => (
              <a key={p} className="btn ghost" href={`${base}/auth/${p}?next=${encodeURIComponent(next)}`}>{t.continueWith(PLAY_PROVIDER_LABEL[p])}</a>
            ))}
          </div>
        )}
        {providers.length > 0 && (email || phone) && <div className="or">{t.orCode}</div>}
        {(email || phone) && (
          <SiteForm action={startSignIn.bind(null, slug)} submit={t.sendCode} pendingLabel={locale === 'ar' ? 'جارٍ الإرسال…' : 'Sending…'}>
            <input type="hidden" name="next" value={next} />
            <div className="fld">
              <label htmlFor="target">{label}</label>
              <input id="target" name="target" className="inp" dir="ltr" autoComplete={phone && !email ? 'tel' : 'email'} inputMode={phone && !email ? 'tel' : undefined} required autoFocus={!providers.length} placeholder={[email && 'name@example.com', phone && '+965 5000 0000'].filter(Boolean).join(' · ')} />
              {phone && <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{t.targetHint}</span>}
            </div>
          </SiteForm>
        )}
      </div>
    </div>
  );
}
