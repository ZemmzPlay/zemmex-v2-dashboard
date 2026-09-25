import Link from 'next/link';
import { getPublicEvent, getPublicPages, homeState } from '@/lib/public-event';
import { builtInPages } from '@/lib/site-pages';
import { SiteNav } from './site-nav';
import { LangSwitch } from './lang-switch';
import { eventType, localiseAll } from '@zemmz/shared';
import { siteTextFor } from '@/lib/site-locale';
import { logoUrlFor } from '@/lib/assets';

export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getPublicEvent(slug);
  const { t, locale } = await siteTextFor(event);
  const base = `/e/${slug}`;
  const logoUrl = await logoUrlFor(event);
  // eslint-disable-next-line @next/next/no-img-element
  const mark = logoUrl ? <img src={logoUrl} alt="" className="logo-img" /> : <span className="mark" aria-hidden="true">{event.shortName}</span>;

  if (homeState(event) === 'maintenance') {
    return (
      <main className="grid min-h-dvh place-items-center px-6 text-center">
        <div className="max-w-[440px]">
          <div className="mx-auto mb-5 flex justify-center">{mark}</div>
          <h1 className="m-0 mb-2 text-[28px] font-bold" style={{ fontFamily: 'var(--serif)' }}>{event.name}</h1>
          <p className="m-0 text-[var(--ink-2)]">{t.maintenance}</p>
        </div>
      </main>
    );
  }

  const pages = localiseAll(await getPublicPages(event.id), locale);
  const links: [string, string][] = [
    [base, t.home],
    ...builtInPages(eventType(event.type)).filter(([k]) => !event.navHidden.includes(k)).map(([k, , path]) => [`${base}${path}`, k === 'people' ? t.v.people : k === 'programme' ? t.programmeNav : t.venue] as [string, string]),
    ...pages.filter((p) => p.inNav).map((p) => [`${base}/p/${p.key}`, p.title] as [string, string]),
  ];

  return (
    <>
      <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-black">{t.skip}</a>
      <header className="top">
        <div className="wrap">
          <Link href={base} className="brand">
            {mark}
            <span className="t">
              <b>{event.name}</b>
              <small>{event.organiserName}</small>
            </span>
          </Link>
          <SiteNav links={links} />
          {event.siteLanguage === 'BOTH' && <LangSwitch slug={slug} to={locale === 'ar' ? 'en' : 'ar'} label={t.switchTo} />}
        </div>
      </header>
      <div id="content">{children}</div>
      <footer className="foot">
        <div className="wrap flex flex-wrap items-center justify-between gap-4">
          <div>
            <b className="text-white">{event.name}</b>
            <div>{event.venueName}{event.venueAddress && `, ${event.venueAddress}`}</div>
            {event.venuePhone && <div className="ltr">{event.venuePhone}</div>}
          </div>
          <div className="powered">{t.poweredBy}</div>
        </div>
      </footer>
    </>
  );
}
