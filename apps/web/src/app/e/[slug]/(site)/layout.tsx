import Link from 'next/link';
import { eventType } from '@zemmz/shared';
import { getPublicEvent, getPublicPages, homeState } from '@/lib/public-event';
import { builtInPages } from '@/lib/site-pages';
import { SiteNav } from './site-nav';
import { logoUrlFor } from '@/lib/assets';

export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getPublicEvent(slug);
  const TY = eventType(event.type);
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
          <p className="m-0 text-[var(--ink-2)]">The website is being updated and will be back shortly. If you’ve registered, your confirmation email and {TY.badge} still work.</p>
        </div>
      </main>
    );
  }

  const pages = await getPublicPages(event.id);
  const links: [string, string][] = [
    [base, 'Home'],
    ...builtInPages(TY).filter(([k]) => !event.navHidden.includes(k)).map(([, label, path]) => [`${base}${path}`, label] as [string, string]),
    ...pages.filter((p) => p.inNav).map((p) => [`${base}/p/${p.key}`, p.title] as [string, string]),
  ];

  return (
    <>
      <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-black">Skip to content</a>
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
        </div>
      </header>
      <div id="content">{children}</div>
      <footer className="foot">
        <div className="wrap flex flex-wrap items-center justify-between gap-4">
          <div>
            <b className="text-white">{event.name}</b>
            <div>{event.venueName}{event.venueAddress && `, ${event.venueAddress}`}</div>
            {event.venuePhone && <div>{event.venuePhone}</div>}
          </div>
          <div className="powered">Registration and check-in by zemmz Live</div>
        </div>
      </footer>
    </>
  );
}
