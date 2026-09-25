'use server';

import { revalidatePath } from 'next/cache';
import { prisma, type Verification } from '@zemmz/db';
import { PLAY_COUNTRIES } from '@zemmz/shared';
import { done, failed, type ActionState } from '@/lib/action-state';
import { logPlay, playCan, requireProjectPermission } from '@/lib/play/core';
import { gamerTagProblem, normaliseTarget } from '@/lib/play/players';

const g = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const refresh = (slug: string) => revalidatePath(`/play/${slug}`, 'layout');

async function player(slug: string, id: string) {
  const ctx = await requireProjectPermission(slug, playCan.moderate);
  const p = await prisma.playPlayer.findFirst({ where: { id, projectId: ctx.project.id } });
  return { ...ctx, p };
}

export async function setVerification(slug: string, id: string, v: Verification) {
  const { user, project, p } = await player(slug, id);
  if (!p) return;
  await prisma.playPlayer.update({ where: { id }, data: { verification: v } });
  await logPlay(project.id, user.name, `${v === 'VERIFIED' ? 'verified' : v === 'REJECTED' ? 'rejected the verification of' : 'reset the verification of'} ${p.gamerTag}`);
  refresh(slug);
}

/** Blacklisted players are signed out and can't register; their current entries are withdrawn. */
export async function setBlacklisted(slug: string, id: string, on: boolean) {
  const { user, project, p } = await player(slug, id);
  if (!p) return;
  await prisma.playPlayer.update({ where: { id }, data: { blacklisted: on } });
  if (on) {
    await prisma.playerSession.deleteMany({ where: { playerId: id } });
    // Solo entries and teams they captain in tournaments that haven't started.
    await prisma.entry.updateMany({ where: { captainId: id, status: { in: ['PENDING_PAYMENT', 'REGISTERED', 'CHECKED_IN'] }, tournament: { status: { in: ['DRAFT', 'PUBLISHED'] } } }, data: { status: 'WITHDRAWN' } });
    await prisma.entryMember.deleteMany({ where: { playerId: id, entry: { captainId: { not: id }, tournament: { status: { in: ['DRAFT', 'PUBLISHED'] } } } } });
  }
  await logPlay(project.id, user.name, `${on ? 'blacklisted' : 'removed from the blacklist'} ${p.gamerTag}`);
  refresh(slug);
}

function details(fd: FormData) {
  const firstName = g(fd, 'firstName').slice(0, 60), lastName = g(fd, 'lastName').slice(0, 60), gamerTag = g(fd, 'gamerTag');
  const email = normaliseTarget(g(fd, 'email'));
  const phoneRaw = g(fd, 'phone');
  const phone = phoneRaw ? normaliseTarget(phoneRaw) : null;
  const country = g(fd, 'country');
  if (!firstName || !lastName) return { error: 'Enter a first and last name.' };
  const tagProblem = gamerTagProblem(gamerTag, 'en');
  if (tagProblem) return { error: tagProblem };
  if (!email || email.kind !== 'email') return { error: 'Enter a valid email address, like name@example.com.' };
  if (phoneRaw && (!phone || phone.kind !== 'phone')) return { error: 'Enter the mobile number with its country code, like +965 5000 0000.' };
  if (country && !PLAY_COUNTRIES.some((c) => c.code === country)) return { error: 'Choose a country from the list.' };
  return { data: { firstName, lastName, gamerTag, email: email.value, phone: phone?.value ?? '', country, note: g(fd, 'note').slice(0, 500) } };
}

async function clash(projectId: string, d: { email: string; gamerTag: string }, except?: string) {
  const other = await prisma.playPlayer.findFirst({ where: { projectId, id: except ? { not: except } : undefined, OR: [{ email: d.email }, { gamerTag: { equals: d.gamerTag, mode: 'insensitive' } }] } });
  if (!other) return null;
  return other.email === d.email ? `${d.email} already has an account on this website.` : `The gamer tag ${d.gamerTag} is taken.`;
}

export async function savePlayer(slug: string, id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, project, p } = await player(slug, id);
  if (!p) return failed('That player no longer exists.');
  const r = details(fd);
  if (!r.data) return failed(r.error!);
  const c = await clash(project.id, r.data, id);
  if (c) return failed(c);
  await prisma.playPlayer.update({ where: { id }, data: r.data });
  // Solo entries are named after the gamer tag.
  if (r.data.gamerTag !== p.gamerTag) await prisma.entry.updateMany({ where: { captainId: id, name: p.gamerTag, tournament: { teamSize: 1 } }, data: { name: r.data.gamerTag } });
  await logPlay(project.id, user.name, `corrected the details of ${r.data.gamerTag}`);
  refresh(slug);
  return done('Saved.');
}

export async function addPlayer(slug: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, project } = await requireProjectPermission(slug, playCan.runTournaments);
  const r = details(fd);
  if (!r.data) return failed(r.error!);
  const c = await clash(project.id, r.data);
  if (c) return failed(c);
  await prisma.playPlayer.create({ data: { ...r.data, projectId: project.id, verification: fd.get('verified') === 'on' ? 'VERIFIED' : 'PENDING' } });
  await logPlay(project.id, user.name, `added the player ${r.data.gamerTag}`);
  refresh(slug);
  return done(`${r.data.gamerTag} added. They sign in with a code sent to ${r.data.email}.`);
}
