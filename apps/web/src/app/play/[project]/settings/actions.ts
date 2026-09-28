'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@zemmz/db';
import { mergeArabic } from '@zemmz/shared';
import { done, failed, type ActionState } from '@/lib/action-state';
import { domainTarget, hasTxt, newDomainToken, normaliseDomain, pointsHere } from '@/lib/domains';
import { logPlay, playCan, PROJECT_ROLES, requireProjectPermission } from '@/lib/play/core';
import { playAccess } from '@/lib/play/billing';
import { playDomain } from '@/lib/play/hosts';
import { setProjectArchived } from '../../actions';

const ZONES = new Set(Intl.supportedValuesOf('timeZone').concat('UTC'));
const refresh = (slug: string) => {
  revalidatePath(`/play/${slug}`, 'layout');
  revalidatePath(`/p/${slug}`, 'layout');
};

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
  refresh(slug);
  return done('Saved.');
}

export async function archiveProject(slug: string) {
  await requireProjectPermission(slug, playCan.manageProject);
  await setProjectArchived(slug, true);
  redirect('/play?tab=archived');
}

/* ---------- the organiser's own domain ---------- */

async function domainCtx(slug: string) {
  const ctx = await requireProjectPermission(slug, playCan.manageProject);
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: ctx.project.organisationId } });
  const a = await playAccess(org);
  // Season (and its trial) and publishers include a domain; Club doesn't.
  const allowed = a.open && (a.state === 'trial' || a.plan === 'PLAY_SEASON' || a.plan === 'PLAY_PUBLISHER');
  return { ...ctx, allowed };
}

export async function setDomain(slug: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, project, allowed } = await domainCtx(slug);
  if (!allowed) return failed('Your own domain comes with the Season plan. Change plan under Plan.');
  const domain = normaliseDomain(String(fd.get('domain') ?? ''));
  if (!domain) return failed('Enter a domain like play.yourleague.com, without https://.');
  if (playDomain() && (domain === playDomain() || domain.endsWith(`.${playDomain()}`))) return failed(`Addresses on ${playDomain()} are given automatically. Use a domain you own.`);
  if (domain === project.customDomain) return done('That’s already this website’s address.');
  if (await prisma.playProject.findFirst({ where: { customDomain: domain, id: { not: project.id } } }) || await prisma.event.findFirst({ where: { customDomain: domain } })) {
    return failed(`${domain} is already used by another website on zemmz.`);
  }
  await prisma.playProject.update({ where: { id: project.id }, data: { customDomain: domain, domainToken: newDomainToken(), domainVerifiedAt: null } });
  await logPlay(project.id, user.name, `set the website address to ${domain}`);
  refresh(slug);
  return done('Now add the two DNS records below, then check them.');
}

export async function verifyDomain(slug: string, _p: ActionState, _fd: FormData): Promise<ActionState> {
  const { user, project, allowed } = await domainCtx(slug);
  if (!allowed) return failed('Your own domain comes with the Season plan. Change plan under Plan.');
  const d = project.customDomain;
  if (!d) return failed('Add the domain first.');
  if (!(await hasTxt(`_zemmz.${d}`, project.domainToken))) return failed(`We couldn’t find the TXT record at _zemmz.${d} yet. DNS changes can take up to an hour.`);
  if (!(await pointsHere(d))) return failed(`${d} doesn’t point at ${domainTarget()} yet. Check the CNAME record.`);
  await prisma.playProject.update({ where: { id: project.id }, data: { domainVerifiedAt: new Date() } });
  await logPlay(project.id, user.name, `connected ${d}`);
  refresh(slug);
  return done(`Connected. https://${d} shows the website; the secure certificate is issued on the first visit.`);
}

export async function removeDomain(slug: string) {
  const { user, project } = await requireProjectPermission(slug, playCan.manageProject);
  if (!project.customDomain) return;
  await prisma.playProject.update({ where: { id: project.id }, data: { customDomain: null, domainToken: '', domainVerifiedAt: null } });
  await logPlay(project.id, user.name, `removed the website address ${project.customDomain}`);
  refresh(slug);
}

/* ---------- people on this website ---------- */

/** Sets someone's role on this website only. ORG goes back to their organisation role. */
export async function setProjectRole(slug: string, userId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, project } = await requireProjectPermission(slug, playCan.manageProject);
  const role = String(fd.get('role') ?? '');
  if (role !== 'ORG' && !PROJECT_ROLES.some(([k]) => k === role)) return failed('Choose a role.');
  const m = await prisma.membership.findFirst({ where: { organisationId: project.organisationId, userId }, include: { user: true } });
  if (!m) return failed('That person is no longer in your organisation.');
  if (m.role === 'OWNER') return failed('Owners manage every website; their access can’t be changed here.');
  if (m.userId === user.id) return failed('You can’t change your own access. Ask another owner or admin.');
  if (role === 'ORG') await prisma.playProjectMember.deleteMany({ where: { projectId: project.id, userId } });
  else await prisma.playProjectMember.upsert({ where: { projectId_userId: { projectId: project.id, userId } }, create: { projectId: project.id, userId, role }, update: { role } });
  const label = role === 'ORG' ? 'their organisation role' : PROJECT_ROLES.find(([k]) => k === role)![1].toLowerCase();
  await logPlay(project.id, user.name, `set ${m.user.name}’s access to ${label}`);
  refresh(slug);
  return done(`${m.user.name} now has ${label} on ${project.name}.`);
}
