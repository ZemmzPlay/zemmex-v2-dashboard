'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

export function SiteNav({ base, name, mark, links, player, t, lang }: {
  base: string; name: string; mark: React.ReactNode; links: [string, string][]; player: string | null;
  t: { signin: string; join: string; myMatches: string; menu: string; lang: string }; lang: 'en' | 'ar' | null;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const current = (h: string) => (h === base ? path === base : path.startsWith(h) || (h.endsWith('/tournaments') && path.startsWith(`${base}/t/`)));
  const langLink = lang && <a className="lang" href={`${base}/lang?to=${lang}&back=${encodeURIComponent(path)}`} lang={lang} hrefLang={lang}>{t.lang}</a>;
  return (
    <header className="nav">
      <div className="wrap">
        <Link className="brand" href={base}>{mark}{name}</Link>
        <nav className="links" aria-label="Main">{links.map(([h, l]) => <Link key={h} href={h} aria-current={current(h) ? 'page' : undefined}>{l}</Link>)}</nav>
        <div className="nav-r">
          {langLink}
          {player
            ? <Link className="btn onnav sm hide-m" href={`${base}/me`}>{t.myMatches}</Link>
            : <><Link className="btn onnav sm hide-m" href={`${base}/signin`}>{t.signin}</Link><Link className="btn primary sm hide-m" href={`${base}/signin?new=1`}>{t.join}</Link></>}
          <button className="burger" aria-label={t.menu} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <svg className="i" viewBox="0 0 24 24" style={{ width: 22, height: 22 }} aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
        </div>
      </div>
      <div className={`mobile-menu ${open ? 'open' : ''}`} onClick={() => setOpen(false)}>
        {links.map(([h, l]) => <Link key={h} href={h}>{l}</Link>)}
        {player ? <Link href={`${base}/me`}>{t.myMatches}</Link> : <><Link href={`${base}/signin`}>{t.signin}</Link><Link href={`${base}/signin?new=1`}>{t.join}</Link></>}
      </div>
    </header>
  );
}
