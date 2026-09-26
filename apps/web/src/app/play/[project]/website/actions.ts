'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@zemmz/db';
import { contrastRatio, hexColourSchema, mergeArabic, sanitizeRichText, stripHtml, textOn, zonedTime } from '@zemmz/shared';
import { done, failed, type ActionState } from '@/lib/action-state';
import { logPlay, playCan, requireProjectPermission } from '@/lib/play/core';
import { SOCIALS } from './socials';

const g = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
async function ctx(slug: string) {
  return requireProjectPermission(slug, playCan.editWebsite);
}
const refresh = (slug: string) => {
  revalidatePath(`/play/${slug}`, 'layout');
  revalidatePath(`/p/${slug}`, 'layout');
};

export interface ThemeState extends ActionState { warn?: string }

export async function saveColour(slug: string, _p: ThemeState, fd: FormData): Promise<ThemeState> {
  const { user, project } = await ctx(slug);
  const parsed = hexColourSchema.safeParse(fd.get('accentColour'));
  if (!parsed.success) return failed(parsed.error.issues[0].message);
  const colour = parsed.data.toUpperCase();
  await prisma.playProject.update({ where: { id: project.id }, data: { colour } });
  await logPlay(project.id, user.name, `changed the website colour to ${colour}`);
  refresh(slug);
  const ratio = contrastRatio(colour, textOn(colour));
  return { ...done('Colour saved.'), warn: ratio < 4.5 ? `Button text reaches only ${ratio.toFixed(1)}:1 on this colour. Choose a darker or lighter shade so it’s easy to read.` : undefined };
}

export async function saveHome(slug: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, project } = await ctx(slug);
  const heroTitle = g(fd, 'heroTitle').slice(0, 100);
  if (!heroTitle) return failed('Give the homepage a headline.');
  const label = g(fd, 'countdownLabel').slice(0, 60);
  const d = g(fd, 'countdownDate'), t = g(fd, 'countdownTime') || '00:00';
  let countdownAt: Date | null = null;
  if (d) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(t)) return failed('Enter the countdown date and time.');
    countdownAt = zonedTime(d, t, project.timezone);
    if (!label) return failed('Say what the countdown is to, for example Season finals.');
  }
  await prisma.playProject.update({
    where: { id: project.id },
    data: {
      heroTitle, heroText: g(fd, 'heroText').slice(0, 300), description: g(fd, 'description').slice(0, 300),
      countdownLabel: countdownAt ? label : '', countdownAt,
      ar: mergeArabic(project.ar, fd, ['heroTitle', 'heroText', 'countdownLabel'], 300),
    },
  });
  await logPlay(project.id, user.name, 'edited the homepage');
  refresh(slug);
  return done('Homepage saved.');
}

/** Rules and FAQ pages; organiser HTML is sanitised before it's stored. */
export async function savePage(slug: string, which: 'rules' | 'faq', _p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, project } = await ctx(slug);
  const html = sanitizeRichText(String(fd.get('bodyHtml') ?? '')).slice(0, 60_000);
  if (!stripHtml(html).trim()) return failed(`The ${which === 'rules' ? 'rules page' : 'FAQ'} is empty. Add some text first.`);
  const arHtml = sanitizeRichText(String(fd.get('ar_bodyHtml') ?? ''));
  const key = which === 'rules' ? 'rulesHtml' : 'faqHtml';
  const ar = mergeArabic(project.ar, { get: (n: string) => (n === `ar_${key}` ? (stripHtml(arHtml).trim() ? arHtml : '') : null) }, [key], 60_000);
  await prisma.playProject.update({ where: { id: project.id }, data: { [key]: html, ar } });
  await logPlay(project.id, user.name, `edited the ${which === 'rules' ? 'rules' : 'FAQ'}`);
  refresh(slug);
  return done('Published on the website.');
}

export async function saveSocials(slug: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, project } = await ctx(slug);
  const socials: Record<string, string> = {};
  for (const s of SOCIALS) {
    const v = g(fd, `social_${s.key}`);
    if (!v) continue;
    const url = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error();
      socials[s.key] = u.toString().slice(0, 300);
    } catch {
      return failed(`The ${s.name} link isn’t a web address. Paste the full link to your profile.`);
    }
  }
  const sponsors = g(fd, 'sponsors').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 24).map((x) => x.slice(0, 60));
  await prisma.playProject.update({ where: { id: project.id }, data: { socials, sponsors } });
  await logPlay(project.id, user.name, 'edited social links and sponsors');
  refresh(slug);
  return done('Saved.');
}
