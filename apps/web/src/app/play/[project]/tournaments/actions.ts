'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma, type TournamentFormat } from '@zemmz/db';
import { CURRENCIES, isCurrency, mergeArabic, PLAY_GAMES, zonedTime } from '@zemmz/shared';
import { done, failed, type ActionState } from '@/lib/action-state';
import { logPlay, playCan, requireProjectPermission, slugify } from '@/lib/play/core';
import { BracketError, confirmResult, endTournament, prizeList, reopenResult, startTournament } from '@/lib/play/bracket';
import { requestProof } from '@/lib/play/reports';
import { refundEntry, refundTournament } from '@/lib/play/entry-payments';
import { PaymentError } from '@/lib/payments';

const FORMATS: TournamentFormat[] = ['SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION', 'ROUND_ROBIN', 'SWISS'];
const g = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

async function ctx(slug: string) {
  return requireProjectPermission(slug, playCan.runTournaments);
}
const refresh = (slug: string) => {
  revalidatePath(`/play/${slug}`, 'layout');
  revalidatePath(`/p/${slug}`, 'layout');
};

/** New tournament or edit, from the four-step form. Saved as a draft unless `publish` is sent. */
export async function saveTournament(slug: string, id: string | null, _p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, project } = await ctx(slug);
  const existing = id ? await prisma.tournament.findFirst({ where: { id, projectId: project.id } }) : null;
  if (id && !existing) return failed('That tournament no longer exists.');
  const started = existing && existing.status !== 'DRAFT' && existing.status !== 'PUBLISHED';

  const name = g(fd, 'name');
  if (name.length < 3 || name.length > 100) return failed('Give the tournament a name of 3 to 100 characters.');
  const game = g(fd, 'game');
  if (!PLAY_GAMES.some((x) => x.key === game)) return failed('Choose the game.');
  const format = g(fd, 'format') as TournamentFormat;
  if (!FORMATS.includes(format)) return failed('Choose a format.');
  const capacity = Number(g(fd, 'capacity'));
  if (!Number.isInteger(capacity) || capacity < 2 || capacity > 4096) return failed('Maximum entrants is a whole number from 2 to 4,096.');
  const teamSize = Number(g(fd, 'teamSize') || 1);
  if (!Number.isInteger(teamSize) || teamSize < 1 || teamSize > 12) return failed('Team size is from 1 (solo) to 12.');
  const bestOf = Number(g(fd, 'bestOf') || 3);
  if (![1, 3, 5, 7].includes(bestOf)) return failed('Choose best of 1, 3, 5 or 7.');
  const tz = g(fd, 'timezone') || project.timezone;
  const at = (k: string) => {
    const d = g(fd, `${k}Date`);
    const t = g(fd, `${k}Time`) || '00:00';
    return /^\d{4}-\d{2}-\d{2}$/.test(d) && /^\d{2}:\d{2}$/.test(t) ? zonedTime(d, t, tz) : null;
  };
  const regOpensAt = at('regOpens'), regClosesAt = at('regCloses'), startsAt = at('starts'), endsAt = at('ends');
  if (!regOpensAt || !regClosesAt || !startsAt || !endsAt) return failed('Fill in every date: registration opens and closes, and the tournament starts and ends.');
  if (regClosesAt <= regOpensAt) return failed('Registration must close after it opens.');
  if (startsAt < regClosesAt) return failed('The tournament must start after registration closes.');
  if (endsAt <= startsAt) return failed('The tournament must end after it starts.');
  const countries = fd.getAll('countries').map(String).filter((c) => /^[A-Z]{2}$/.test(c));
  const currency = g(fd, 'currency') || 'AED';
  if (!isCurrency(currency)) return failed('Choose a currency.');
  const exp = CURRENCIES[currency].exponent;
  const fee = Number(g(fd, 'entryFee') || 0);
  if (!Number.isFinite(fee) || fee < 0 || fee > 10_000) return failed('Enter the entry fee as a number, or 0 for free.');
  // Prizes come in as place/amount/label rows.
  const prizes = prizeList(fd.getAll('prizePlace').map((p, i) => ({
    place: Number(p), amountMinor: Math.round(Number(fd.getAll('prizeAmount')[i] || 0) * 10 ** exp), label: String(fd.getAll('prizeLabel')[i] ?? ''),
  })));

  const data = {
    name, game, format, capacity, teamSize, bestOf, timezone: tz, regOpensAt, regClosesAt, startsAt, endsAt, countries,
    platform: g(fd, 'platform').slice(0, 60), description: g(fd, 'description').slice(0, 2000),
    playersReport: fd.get('playersReport') === 'on', verifiedOnly: fd.get('verifiedOnly') === 'on', checkIn: fd.get('checkIn') === 'on',
    currency, entryFeeMinor: Math.round(fee * 10 ** exp), prizes: prizes as unknown as object,
    ar: mergeArabic(existing?.ar, fd, ['name', 'description'], 2000),
  };
  if (started) {
    // Once the bracket exists, only the words and prizes can change.
    await prisma.tournament.update({ where: { id: existing!.id }, data: { name, description: data.description, prizes: data.prizes, ar: data.ar, endsAt } });
    await logPlay(project.id, user.name, `edited ${name}`);
    refresh(slug);
    redirect(`/play/${slug}/tournaments/${existing!.slug}`);
  }
  let t;
  if (existing) {
    t = await prisma.tournament.update({ where: { id: existing.id }, data });
    await logPlay(project.id, user.name, `edited ${name}`);
  } else {
    let s = slugify(name);
    for (let n = 2; await prisma.tournament.findUnique({ where: { projectId_slug: { projectId: project.id, slug: s } } }); n++) s = `${slugify(name).slice(0, 45)}-${n}`;
    t = await prisma.tournament.create({ data: { ...data, projectId: project.id, slug: s, status: fd.get('publish') ? 'PUBLISHED' : 'DRAFT' } });
    await logPlay(project.id, user.name, `created ${name}`);
  }
  refresh(slug);
  redirect(`/play/${slug}/tournaments/${t.slug}${existing ? '' : '?created=1'}`);
}

export async function setPublished(slug: string, tournamentId: string, publish: boolean) {
  const { user, project } = await ctx(slug);
  const t = await prisma.tournament.findFirst({ where: { id: tournamentId, projectId: project.id } });
  if (!t || (t.status !== 'DRAFT' && t.status !== 'PUBLISHED')) return;
  await prisma.tournament.update({ where: { id: t.id }, data: { status: publish ? 'PUBLISHED' : 'DRAFT' } });
  await logPlay(project.id, user.name, `${publish ? 'published' : 'unpublished'} ${t.name}`);
  refresh(slug);
}

export async function startAction(slug: string, tournamentId: string, _p: ActionState, _fd: FormData): Promise<ActionState> {
  const { user, project } = await ctx(slug);
  const t = await prisma.tournament.findFirst({ where: { id: tournamentId, projectId: project.id } });
  if (!t) return failed('That tournament no longer exists.');
  try {
    const r = await startTournament(t.id);
    await logPlay(project.id, user.name, `started ${t.name} with ${r.entrants} entrants`);
    refresh(slug);
    return done(`Started with ${r.entrants} ${t.teamSize > 1 ? 'teams' : 'players'}.${r.withdrawn ? ` ${r.withdrawn} who weren’t ready were withdrawn.` : ''} The first matches are open.`);
  } catch (e) {
    if (e instanceof BracketError) return failed(e.message);
    throw e;
  }
}

export async function endAction(slug: string, tournamentId: string) {
  const { user, project } = await ctx(slug);
  const t = await prisma.tournament.findFirst({ where: { id: tournamentId, projectId: project.id } });
  if (!t) return;
  await endTournament(t.id).catch((e) => {
    if (!(e instanceof BracketError)) throw e;
  });
  // A tournament cancelled before it started gives everyone their entry fee back.
  const refunds = t.status === 'LIVE' ? null : await refundTournament(t.id, `${t.name} was cancelled`);
  await logPlay(project.id, user.name, `${t.status === 'LIVE' ? 'ended' : 'cancelled'} ${t.name}${refunds?.done ? `, refunding ${refunds.done} entry ${refunds.done === 1 ? 'fee' : 'fees'}` : ''}${refunds?.failed ? ` (${refunds.failed} refunds failed; retry from Participants)` : ''}`);
  refresh(slug);
}

export async function refundEntryAction(slug: string, entryId: string, _p: ActionState, _fd: FormData): Promise<ActionState> {
  const { user, project } = await requireProjectPermission(slug, playCan.manageProject);
  const order = await prisma.entryOrder.findFirst({ where: { entryId, tournament: { projectId: project.id } }, include: { tournament: true } });
  if (!order || order.status !== 'PAID') return failed('There’s no paid entry fee to refund.');
  try {
    await refundEntry(order.id, `Refunded by ${user.name}`);
  } catch (e) {
    return failed(e instanceof PaymentError ? `${e.message} Nothing was refunded; try again later.` : 'The payment provider didn’t answer. Nothing was refunded; try again later.');
  }
  const entry = await prisma.entry.findUniqueOrThrow({ where: { id: entryId } });
  if (order.tournament.status === 'DRAFT' || order.tournament.status === 'PUBLISHED') await prisma.entry.update({ where: { id: entryId }, data: { status: 'WITHDRAWN' } });
  await logPlay(project.id, user.name, `refunded the entry fee for ${entry.name} in ${order.tournament.name}`);
  refresh(slug);
  return done('Refunded. It reaches the card in 5 to 10 working days.');
}

async function matchIn(slug: string, matchId: string, check = playCan.moderate) {
  const c = await requireProjectPermission(slug, check);
  const match = await prisma.match.findFirst({ where: { id: matchId, tournament: { projectId: c.project.id } }, include: { tournament: true } });
  return { ...c, match };
}

/** Confirms a result from a score report, or enters one by hand. */
export async function confirmMatch(slug: string, matchId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, project, match } = await matchIn(slug, matchId);
  if (!match) return failed('That match no longer exists.');
  const a = Number(g(fd, 'scoreA')), b = Number(g(fd, 'scoreB'));
  try {
    const r = await confirmResult({ matchId, scoreA: a, scoreB: b, by: user.name, note: g(fd, 'note') });
    const names = await prisma.entry.findMany({ where: { id: { in: [match.entryAId, match.entryBId].filter(Boolean) as string[] } } });
    const winner = names.find((e) => e.id === r.winnerId)?.name ?? 'The winner';
    await logPlay(project.id, user.name, `confirmed ${names.map((n) => n.name).join(' vs ')} ${a}–${b} in ${match.tournament.name}`);
    refresh(slug);
    return done(r.ended ? `${winner} wins. That was the last match, so ${match.tournament.name} has ended and places are set.` : `${winner} goes through. The bracket is updated.`);
  } catch (e) {
    if (e instanceof BracketError) return failed(e.message);
    throw e;
  }
}

export async function reopenMatch(slug: string, matchId: string) {
  const { user, project, match } = await matchIn(slug, matchId, playCan.runTournaments);
  if (!match) return;
  await reopenResult(matchId).catch((e) => {
    if (!(e instanceof BracketError)) throw e;
  });
  await logPlay(project.id, user.name, `reopened a result in ${match.tournament.name}`);
  refresh(slug);
}

export async function askForProof(slug: string, matchId: string) {
  const { user, project, match } = await matchIn(slug, matchId);
  if (!match) return;
  await requestProof(matchId);
  // Tell both sides' players.
  const members = await prisma.entryMember.findMany({ where: { entryId: { in: [match.entryAId, match.entryBId].filter(Boolean) as string[] } }, include: { player: true } });
  for (const m of members) {
    await prisma.outboundMessage.create({
      data: {
        channel: 'EMAIL', toAddress: m.player.email, toName: m.player.gamerTag, subject: `${project.name}: send a clearer screenshot`,
        html: `<p>Hi ${m.player.firstName},</p><p>The organisers of ${match.tournament.name} couldn’t read the result of your match. Please upload a clearer screenshot of the result screen from My matches on the website.</p>`,
        text: `The organisers of ${match.tournament.name} couldn’t read the result of your match. Upload a clearer screenshot from My matches.`,
      },
    });
  }
  await logPlay(project.id, user.name, `asked for a new screenshot in ${match.tournament.name}`);
  refresh(slug);
}

export async function setEntryStatus(slug: string, entryId: string, status: 'DISQUALIFIED' | 'REGISTERED' | 'CHECKED_IN' | 'WITHDRAWN') {
  const { user, project } = await ctx(slug);
  const e = await prisma.entry.findFirst({ where: { id: entryId, tournament: { projectId: project.id } }, include: { tournament: true } });
  if (!e) return;
  if (status === 'CHECKED_IN' && e.tournament.status !== 'PUBLISHED') return;
  await prisma.entry.update({ where: { id: e.id }, data: { status } });
  await logPlay(project.id, user.name, `${{ DISQUALIFIED: 'disqualified', REGISTERED: 'reinstated', CHECKED_IN: 'checked in', WITHDRAWN: 'withdrew' }[status]} ${e.name} in ${e.tournament.name}`);
  refresh(slug);
}

export async function saveSeeds(slug: string, tournamentId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const { project } = await ctx(slug);
  const t = await prisma.tournament.findFirst({ where: { id: tournamentId, projectId: project.id } });
  if (!t || t.status === 'LIVE' || t.status === 'ENDED') return failed('Seeds can only change before the tournament starts.');
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith('seed_')) continue;
    const n = String(v).trim() ? Number(v) : null;
    if (n !== null && (!Number.isInteger(n) || n < 1)) return failed('Seeds are whole numbers from 1, or empty.');
    await prisma.entry.updateMany({ where: { id: k.slice(5), tournamentId: t.id }, data: { seed: n } });
  }
  refresh(slug);
  return done('Seeds saved. Seed 1 is kept apart from seed 2 until the final.');
}

export async function markPrizePaid(slug: string, awardId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, project } = await requireProjectPermission(slug, playCan.manageProject);
  const a = await prisma.prizeAward.findFirst({ where: { id: awardId, tournament: { projectId: project.id } }, include: { tournament: true } });
  if (!a) return failed('That prize no longer exists.');
  const reference = g(fd, 'reference').slice(0, 80);
  if (!reference) return failed('Enter the payment reference, so the winner can match it.');
  await prisma.prizeAward.update({ where: { id: a.id }, data: { paidAt: new Date(), reference } });
  await logPlay(project.id, user.name, `marked the place ${a.place} prize in ${a.tournament.name} as paid (${reference})`);
  refresh(slug);
  return done('Marked as paid.');
}
