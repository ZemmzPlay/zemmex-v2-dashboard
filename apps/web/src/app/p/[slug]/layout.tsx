import type { Metadata } from 'next';
import Link from 'next/link';
import { IBM_Plex_Sans_Arabic, Sora } from 'next/font/google';
import { currentPlayer } from '@/lib/play/players';
import { siteFor, siteTheme } from '@/lib/play/site';
import { SOCIALS } from '@/app/play/[project]/website/socials';
import { SiteNav } from './site-nav';
import { Countdown } from './countdown';
import { SocialIcon } from './social-icon';
import '../play.css';

const sora = Sora({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-sora', display: 'swap' });
const plexArabic = IBM_Plex_Sans_Arabic({ subsets: ['arabic'], weight: ['400', '500', '600', '700'], variable: '--font-plex-ar', display: 'swap', preload: false });

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { project } = await siteFor((await params).slug);
  return { title: { default: project.name, template: `%s · ${project.name}` }, description: project.description || project.heroText, openGraph: { title: project.name, description: project.description || project.heroText } };
}

export default async function PlaySiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { project, open, logoUrl, locale, t, base } = await siteFor(slug);
  const shell = (body: React.ReactNode) => (
    <div className={`pl ${sora.variable} ${locale === 'ar' ? plexArabic.variable : ''}`} lang={locale === 'ar' ? 'ar' : 'en-GB'} dir={t.dir} style={siteTheme(project.colour)}>{body}</div>
  );
  const mark = logoUrl ? <img src={logoUrl} alt="" /> : <span className="mk">{project.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase()}</span>;
  if (!open) {
    return shell(<main className="offline"><div><div className="brand" style={{ justifyContent: 'center', color: 'var(--ink)', marginBottom: 18 }}>{mark}{project.name}</div><h1 style={{ margin: '0 0 8px' }}>{t.offlineT}</h1><p style={{ margin: 0, color: 'var(--muted)' }}>{t.offlineP}</p></div></main>);
  }
  const player = await currentPlayer(project.id);
  const socials = (project.socials ?? {}) as Record<string, string>;
  const links: [string, string][] = [[base, t.nav.home], [`${base}/tournaments`, t.nav.tournaments], [`${base}/standings`, t.nav.standings], [`${base}/rules`, t.nav.rules], [`${base}/faq`, t.nav.faq]];
  return shell(
    <>
      {project.countdownAt && project.countdownAt > new Date() && <div className="cd">{project.countdownLabel} {t.startsIn}<Countdown at={project.countdownAt.toISOString()} locale={locale} /></div>}
      <SiteNav
        base={base} name={project.name} mark={mark} links={links} player={player ? player.gamerTag : null}
        t={{ signin: t.signin, join: t.join, myMatches: t.myMatches, menu: t.menu, lang: t.lang }}
        lang={project.siteLanguage === 'BOTH' ? (locale === 'ar' ? 'en' : 'ar') : null}
      />
      <main id="main">{children}</main>
      <footer>
        <div className="wrap">
          <div className="cols">
            <div><div className="brand" style={{ color: '#fff' }}>{mark}{project.name}</div><p style={{ maxWidth: 320, margin: '14px 0 0' }}>{project.description || t.footAbout}</p></div>
            <div><h4>{t.explore}</h4>{links.slice(0, 3).map(([h, l]) => <Link key={h} className="fl" href={h}>{l}</Link>)}</div>
            <div><h4>{t.help}</h4>{links.slice(3).map(([h, l]) => <Link key={h} className="fl" href={h}>{l}</Link>)}</div>
            {Object.keys(socials).length > 0 && (
              <div><h4>{t.follow}</h4><div className="socials">{SOCIALS.filter((s) => socials[s.key]).map((s) => <a key={s.key} href={socials[s.key]} target="_blank" rel="noopener noreferrer" aria-label={s.name} title={s.name}><SocialIcon k={s.key} /></a>)}</div></div>
            )}
          </div>
          <div className="legal"><span>© {new Date().getFullYear()} {project.name}</span><a className="powered" href="/zemmz-play" style={{ color: 'inherit' }}>{t.powered}</a></div>
        </div>
      </footer>
    </>,
  );
}
