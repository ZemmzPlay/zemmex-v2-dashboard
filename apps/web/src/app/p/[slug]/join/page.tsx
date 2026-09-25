import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { PLAY_COUNTRIES } from '@zemmz/shared';
import { unsealData } from '@/lib/order-tokens';
import { siteFor } from '@/lib/play/site';
import { createAccount } from '../actions';
import { SiteForm } from '../site-form';

export const metadata: Metadata = { robots: { index: false } };

export default async function Join({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { project, t, locale, base } = await siteFor(slug);
  const raw = (await cookies()).get('zplay_new')?.value;
  const p = raw ? unsealData<{ p: string; target: string; kind: 'email' | 'phone' }>('zplay_new', raw) : null;
  if (!p || p.p !== project.id) redirect(`${base}/signin?new=1`);
  const opt = <span style={{ color: 'var(--muted)', fontWeight: 400 }}> ({t.optional})</span>;
  return (
    <div className="wrap">
      <SiteForm action={createAccount.bind(null, slug)} className="auth" submit={t.createBtn} pendingLabel={locale === 'ar' ? 'جارٍ الإنشاء…' : 'Creating…'}>
        <h1>{t.joinT}</h1>
        <p className="sub">{t.joinSub}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="fld"><label htmlFor="fn">{t.firstName}</label><input id="fn" name="firstName" className="inp" autoComplete="given-name" required maxLength={60} /></div>
          <div className="fld"><label htmlFor="ln">{t.lastName}</label><input id="ln" name="lastName" className="inp" autoComplete="family-name" required maxLength={60} /></div>
        </div>
        <div className="fld"><label htmlFor="tag">{t.gamerTag}</label><input id="tag" name="gamerTag" className="inp" dir="auto" required maxLength={24} autoComplete="nickname" /></div>
        {p.kind === 'phone'
          ? <div className="fld"><label htmlFor="em">{t.email}</label><input id="em" name="email" type="email" className="inp" dir="ltr" required autoComplete="email" /></div>
          : <div className="fld"><label htmlFor="ph">{t.phone}{opt}</label><input id="ph" name="phone" className="inp" dir="ltr" inputMode="tel" autoComplete="tel" placeholder="+965 5000 0000" /></div>}
        <div className="fld"><label htmlFor="c">{t.country}</label><select id="c" name="country" className="inp" required defaultValue=""><option value="" disabled>—</option>{PLAY_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {locale === 'ar' ? c.ar : c.name}</option>)}</select></div>
        <label style={{ display: 'flex', gap: 10, fontSize: 13.5, color: 'var(--ink-2)', margin: '4px 0 16px', alignItems: 'flex-start' }}>
          <input type="checkbox" name="terms" style={{ marginTop: 3, accentColor: 'var(--brand)' }} /> <span>{t.terms} (<Link href={`${base}/rules`} target="_blank">{t.nav.rules}</Link>)</span>
        </label>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 14px' }}>{t.verifiedNote}</p>
      </SiteForm>
    </div>
  );
}
