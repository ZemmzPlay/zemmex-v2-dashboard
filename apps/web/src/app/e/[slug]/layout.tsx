import type { Metadata } from 'next';
import { Fraunces, IBM_Plex_Sans_Arabic, Inter, Source_Serif_4, Space_Grotesk, Unbounded } from 'next/font/google';
import { formatDateRange } from '@zemmz/shared';
import { getPublicEvent, themeFor } from '@/lib/public-event';
import { siteTextFor } from '@/lib/site-locale';
import '../site.css';

// Each type has its own character; only the one in use is downloaded.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const sourceSerif = Source_Serif_4({ subsets: ['latin'], weight: ['500', '700'], variable: '--font-source-serif', display: 'swap', preload: false });
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], weight: ['500', '700'], variable: '--font-space-grotesk', display: 'swap', preload: false });
const fraunces = Fraunces({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-fraunces', display: 'swap', preload: false });
const plexArabic = IBM_Plex_Sans_Arabic({ subsets: ['arabic'], weight: ['400', '500', '600', '700'], variable: '--font-plex-ar', display: 'swap', preload: false });
const unbounded = Unbounded({ subsets: ['latin'], weight: ['600', '800'], variable: '--font-unbounded', display: 'swap', preload: false });

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const e = await getPublicEvent((await params).slug);
  const { t, locale } = await siteTextFor(e);
  const when = formatDateRange(e.startsOn, e.endsOn, 'UTC', locale);
  return {
    title: { default: e.name, template: `%s · ${e.name}` },
    description: e.heroText || [t.v.label, when, e.venueName].filter(Boolean).join(' · '),
    openGraph: { title: e.name, description: `${when} · ${e.venueName}` },
  };
}

export default async function PublicEventLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const event = await getPublicEvent((await params).slug);
  const theme = themeFor(event);
  const { t, locale } = await siteTextFor(event);
  return (
    <div lang={locale === 'ar' ? 'ar' : 'en-GB'} dir={t.dir} className={`${theme.className} ${inter.variable} ${sourceSerif.variable} ${spaceGrotesk.variable} ${fraunces.variable} ${unbounded.variable} ${locale === 'ar' ? plexArabic.variable : ''}`} style={theme.style}>
      {children}
    </div>
  );
}
