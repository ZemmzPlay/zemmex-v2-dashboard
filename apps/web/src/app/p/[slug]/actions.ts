'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@zemmz/db';
import { PLAY_COUNTRIES } from '@zemmz/shared';
import { failed, done, type ActionState } from '@/lib/action-state';
import { sealData, unsealData } from '@/lib/order-tokens';
import { rateLimit } from '@/lib/rate-limit';
import { siteFor } from '@/lib/play/site';
import { checkPlayerCode, currentPlayer, endPlayerSession, gamerTagProblem, normaliseTarget, PlayerAuthError, sendPlayerCode, startPlayerSession } from '@/lib/play/players';
import { checkIn, EntryError, joinTeam, register, withdraw } from '@/lib/play/entries';
import { markEntryFailed, refundEntry, startEntryPayment } from '@/lib/play/entry-payments';
import { PaymentError } from '@/lib/payments';

const g = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const PENDING = 'zplay_pending';
const NEW = 'zplay_new';
const TEN_MIN = 10 * 60_000;
type Pending = { p: string; target: string; kind: 'email' | 'phone'; next: string; at: number };

/** Only paths on this website. */
const safeNext = (base: string, next: string) => (next.startsWith(`${base}/`) || next === base ? next : `${base}/me`);

async function pending(name: string, projectId: string): Promise<Pending | null> {
  const raw = (await cookies()).get(name)?.value;
  const v = raw ? unsealData<Pending>(name, raw) : null;
  return v && v.p === projectId && Date.now() - v.at < (name === NEW ? 30 * 60_000 : TEN_MIN) ? v : null;
}
async function setPending(name: string, base: string, v: Pending) {
  (await cookies()).set(name, sealData(name, v), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: base, maxAge: 1800 });
}

export async function startSignIn(slug: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const { project, t, locale, base } = await siteFor(slug);
  const target = normaliseTarget(g(fd, 'target'));
  if (!target) return failed(t.badTarget);
  if (!rateLimit(`play-code:${project.id}:${target.value}`, 5, 15 * 60_000)) return failed(locale === 'ar' ? 'أرسلنا عدة رموز. انتظر بضع دقائق.' : 'We’ve sent several codes. Wait a few minutes and try again.');
  try {
    await sendPlayerCode(project, target, locale);
  } catch (e) {
    if (e instanceof PlayerAuthError) return failed(e.message);
    throw e;
  }
  await setPending(PENDING, base, { p: project.id, target: target.value, kind: target.kind, next: safeNext(base, g(fd, 'next')), at: Date.now() });
  redirect(`${base}/signin/code`);
}

export async function resendCode(slug: string): Promise<ActionState> {
  const { project, locale, t } = await siteFor(slug);
  const p = await pending(PENDING, project.id);
  if (!p) return failed(t.expired);
  try {
    await sendPlayerCode(project, { kind: p.kind, value: p.target }, locale);
  } catch (e) {
    if (e instanceof PlayerAuthError) return failed(e.message);
    throw e;
  }
  return done(locale === 'ar' ? 'أرسلنا رمزاً جديداً.' : 'We sent a new code.');
}

export async function verifySignIn(slug: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const { project, t, base, locale } = await siteFor(slug);
  const p = await pending(PENDING, project.id);
  if (!p) return failed(t.expired);
  if (!rateLimit(`play-verify:${project.id}:${p.target}`, 10, 15 * 60_000) || !(await checkPlayerCode(project.id, p.target, g(fd, 'code')))) return failed(t.badCode);
  const jar = await cookies();
  jar.delete({ name: PENDING, path: base });
  const player = await prisma.playPlayer.findFirst({ where: { projectId: project.id, ...(p.kind === 'email' ? { email: p.target } : { phone: p.target }) } });
  if (player) {
    if (player.blacklisted) return failed(locale === 'ar' ? 'لا يمكن لهذا الحساب تسجيل الدخول. تواصل مع المنظمين.' : 'This account can’t sign in. Contact the organisers.');
    await startPlayerSession(project, player.id);
    redirect(p.next);
  }
  await setPending(NEW, base, { ...p, at: Date.now() });
  redirect(`${base}/join`);
}

export async function createAccount(slug: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const { project, t, locale, base } = await siteFor(slug);
  const p = await pending(NEW, project.id);
  if (!p) return failed(t.expired);
  const firstName = g(fd, 'firstName').slice(0, 60), lastName = g(fd, 'lastName').slice(0, 60), gamerTag = g(fd, 'gamerTag'), country = g(fd, 'country');
  if (!firstName || !lastName) return failed(t.nameReq);
  const tagProblem = gamerTagProblem(gamerTag, locale);
  if (tagProblem) return failed(tagProblem);
  if (!PLAY_COUNTRIES.some((c) => c.code === country)) return failed(t.countryReq);
  let email = p.kind === 'email' ? p.target : '';
  let phone = p.kind === 'phone' ? p.target : '';
  if (p.kind === 'phone') {
    const e = normaliseTarget(g(fd, 'email'));
    if (!e || e.kind !== 'email') return failed(t.badTarget);
    email = e.value;
  } else if (g(fd, 'phone')) {
    const ph = normaliseTarget(g(fd, 'phone'));
    if (!ph || ph.kind !== 'phone') return failed(t.badTarget);
    phone = ph.value;
  }
  if (fd.get('terms') !== 'on') return failed(t.mustAgree);
  const clash = await prisma.playPlayer.findFirst({ where: { projectId: project.id, OR: [{ email }, { gamerTag: { equals: gamerTag, mode: 'insensitive' } }, ...(phone ? [{ phone }] : [])] } });
  if (clash) return failed(clash.email === email ? t.emailTaken : clash.phone && clash.phone === phone ? t.phoneTaken : t.tagTaken);
  const player = await prisma.playPlayer.create({ data: { projectId: project.id, firstName, lastName, gamerTag, email, phone, country, locale } });
  (await cookies()).delete({ name: NEW, path: base });
  await startPlayerSession(project, player.id);
  redirect(p.next);
}

export async function signOut(slug: string) {
  const { project, base } = await siteFor(slug);
  await endPlayerSession(project);
  redirect(base);
}

async function withPlayer(slug: string, tournamentSlug: string, next: string) {
  const s = await siteFor(slug);
  const player = await currentPlayer(s.project.id);
  if (!player) redirect(`${s.base}/signin?next=${encodeURIComponent(next)}`);
  const tournament = await prisma.tournament.findUnique({ where: { projectId_slug: { projectId: s.project.id, slug: tournamentSlug } } });
  return { ...s, player, tournament };
}

const refresh = (slug: string) => revalidatePath(`/p/${slug}`, 'layout');

export async function registerAction(slug: string, tSlug: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const { base, player, tournament, locale, project } = await withPlayer(slug, tSlug, `/p/${slug}/t/${tSlug}#register`);
  if (!tournament || tournament.status === 'DRAFT') return failed('That tournament no longer exists.');
  let url: string | null = null;
  try {
    const { entry, price } = await register(tournament, player, { teamName: g(fd, 'teamName'), locale });
    if (price.totalMinor) url = await startEntryPayment({ project, tournament, entry, player, locale });
  } catch (e) {
    if (e instanceof EntryError || e instanceof PaymentError) return failed(e.message);
    throw e;
  }
  refresh(slug);
  redirect(url ?? `${base}/me?registered=${tournament.slug}`);
}

export async function joinTeamAction(slug: string, tSlug: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const { base, player, tournament, locale } = await withPlayer(slug, tSlug, `/p/${slug}/t/${tSlug}#register`);
  if (!tournament) return failed('That tournament no longer exists.');
  try {
    await joinTeam(tournament, player, g(fd, 'code'), locale);
  } catch (e) {
    if (e instanceof EntryError) return failed(e.message);
    throw e;
  }
  refresh(slug);
  redirect(`${base}/me?registered=${tournament.slug}`);
}

/** Pays for an entry held for payment: the old checkout is dropped and a new one starts. */
export async function payAgain(slug: string, tSlug: string) {
  const { player, tournament, locale, project, base } = await withPlayer(slug, tSlug, `/p/${slug}/me`);
  if (!tournament) redirect(`${base}/me`);
  const order = await prisma.entryOrder.findFirst({ where: { tournamentId: tournament.id, playerId: player.id, status: 'PENDING' }, orderBy: { createdAt: 'desc' } });
  if (order) await markEntryFailed(order.id);
  let url: string;
  try {
    const previous = await prisma.entry.findFirst({ where: { tournamentId: tournament.id, captainId: player.id }, orderBy: { createdAt: 'desc' } });
    const { entry } = await register(tournament, player, { teamName: previous?.name, locale });
    url = await startEntryPayment({ project, tournament, entry, player, locale });
  } catch (e) {
    if (e instanceof EntryError || e instanceof PaymentError) redirect(`${base}/me?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  redirect(url);
}

export async function withdrawAction(slug: string, tSlug: string) {
  const { player, tournament, locale, base } = await withPlayer(slug, tSlug, `/p/${slug}/me`);
  if (!tournament) redirect(`${base}/me`);
  try {
    const entry = await withdraw(tournament, player, locale);
    // The captain (or solo player) leaving gets the entry fee back.
    if (entry.captainId === player.id) {
      const order = await prisma.entryOrder.findFirst({ where: { entryId: entry.id, status: 'PAID' } });
      if (order) await refundEntry(order.id, 'Withdrew before the start').catch(() => undefined);
      await prisma.entryOrder.updateMany({ where: { entryId: entry.id, status: 'PENDING' }, data: { status: 'FAILED' } });
    }
  } catch (e) {
    if (e instanceof EntryError) redirect(`${base}/me?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  refresh(slug);
  redirect(`${base}/me?withdrawn=1`);
}

export async function checkInAction(slug: string, tSlug: string) {
  const { player, tournament, locale, base } = await withPlayer(slug, tSlug, `/p/${slug}/me`);
  if (!tournament) redirect(`${base}/me`);
  try {
    await checkIn(tournament, player, locale);
  } catch (e) {
    if (e instanceof EntryError) redirect(`${base}/me?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  refresh(slug);
  redirect(`${base}/me`);
}
