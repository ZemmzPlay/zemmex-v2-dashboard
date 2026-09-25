import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { prisma, type PlayProject, type Tournament } from '@zemmz/db';
import { contrastRatio, fixContrast, localise, textOn } from '@zemmz/shared';
import { playAccess } from './billing';
import { playText } from './site-text';
import { fileUrl } from '@/lib/storage';

export const PLAY_LANG_COOKIE = 'zplang';

/** A tournament website by its address, or 404 (archived websites look missing). */
export const getSiteProject = cache(async (slug: string) => {
  const project = await prisma.playProject.findUnique({ where: { slug }, include: { organisation: true } });
  if (!project || project.archivedAt) notFound();
  const access = await playAccess(project.organisation);
  const logo = project.logoAssetId ? await prisma.asset.findUnique({ where: { id: project.logoAssetId } }) : null;
  return { project, open: access.open, logoUrl: logo ? fileUrl(logo.key) : null };
});

export const siteLocale = cache(async (p: Pick<PlayProject, 'siteLanguage'>): Promise<'en' | 'ar'> => {
  if (p.siteLanguage === 'AR') return 'ar';
  if (p.siteLanguage === 'EN') return 'en';
  return (await cookies()).get(PLAY_LANG_COOKIE)?.value === 'ar' ? 'ar' : 'en';
});

/** The website in the visitor's language: the words, and the organiser's text swapped for its Arabic where there is one. */
export const siteFor = cache(async (slug: string) => {
  const s = await getSiteProject(slug);
  const locale = await siteLocale(s.project);
  return { ...s, project: localise(s.project, locale), locale, t: playText(locale), base: `/p/${slug}` };
});

export const tName = (t: Tournament, locale: 'en' | 'ar') => localise(t, locale).name;

const NAV_BG = '#07052E', LIGHT_BG = '#F4F5FA', DARK_BG = '#0B0A1F';

/** Organiser colour as CSS variables, contrast-checked against where each is used. */
export function siteTheme(colour: string): React.CSSProperties {
  const ink = textOn(colour);
  return {
    ['--brand' as string]: colour,
    ['--brand-ink' as string]: ink,
    ['--link-l' as string]: fixContrast(colour, LIGHT_BG),
    ['--link-d' as string]: fixContrast(colour, DARK_BG),
    ['--nav-hi' as string]: contrastRatio(colour, NAV_BG) >= 4.5 ? colour : fixContrast(colour, NAV_BG),
  };
}
