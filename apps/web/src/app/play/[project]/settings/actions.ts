'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@zemmz/db';
import { mergeArabic } from '@zemmz/shared';
import { done, failed, type ActionState } from '@/lib/action-state';
import { logPlay, playCan, requireProjectPermission } from '@/lib/play/core';
import { setProjectArchived } from '../../actions';

const ZONES = new Set(Intl.supportedValuesOf('timeZone').concat('UTC'));

export async function saveProject(slug: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, project } = await requireProjectPermission(slug, playCan.manageProject);
  const name = String(fd.get('name') ?? '').trim();
  if (name.length < 2 || name.length > 80) return failed('Give the website a name of 2 to 80 characters.');
  const lang = String(fd.get('language'));
  const tz = String(fd.get('timezone'));
  if (!ZONES.has(tz)) return failed('Choose a timezone from the list.');
  await prisma.playProject.update({
    where: { id: project.id },
    data: { name, siteLanguage: lang === 'EN' || lang === 'AR' ? lang : 'BOTH', timezone: tz, ar: mergeArabic(project.ar, fd, ['name'], 80) },
  });
  await logPlay(project.id, user.name, 'changed the website settings');
  revalidatePath(`/play/${slug}`, 'layout');
  revalidatePath(`/p/${slug}`, 'layout');
  return done('Saved.');
}

export async function archiveProject(slug: string) {
  await requireProjectPermission(slug, playCan.manageProject);
  await setProjectArchived(slug, true);
  redirect('/play?tab=archived');
}
