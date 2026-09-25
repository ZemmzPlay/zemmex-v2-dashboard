import 'server-only';
import { randomBytes } from 'node:crypto';
import { prisma, type PlayPlayer, type Tournament } from '@zemmz/db';
import { isCurrency, ticketFee } from '@zemmz/shared';
import { ACTIVE_ENTRY, tournamentPhase } from './core';
import { playAccess } from './billing';

export class EntryError extends Error {}

type L = 'en' | 'ar';
const msg = (l: L, en: string, ar: string) => (l === 'ar' ? ar : en);

/** Check-in opens this long before the start and closes at the start. */
export const CHECK_IN_MINUTES = 60;

export function checkInOpen(t: Pick<Tournament, 'checkIn' | 'startsAt' | 'status'>, now = new Date()) {
  return t.checkIn && t.status === 'PUBLISHED' && now.getTime() >= t.startsAt.getTime() - CHECK_IN_MINUTES * 60_000 && now < t.startsAt;
}

/** Why this player can't enter, or null. */
export async function entryBlock(t: Tournament, player: PlayPlayer, l: L): Promise<string | null> {
  if (tournamentPhase(t) !== 'reg') return msg(l, 'Registration for this tournament isn’t open.', 'التسجيل في هذه البطولة غير مفتوح.');
  if (player.blacklisted) return msg(l, 'Your account can’t register for tournaments. Contact the organisers.', 'لا يمكن لحسابك التسجيل في البطولات. تواصل مع المنظمين.');
  if (t.verifiedOnly && player.verification !== 'VERIFIED') return msg(l, 'Only verified players can register. The organisers check new accounts; try again once you’re verified.', 'التسجيل متاح للاعبين الموثقين فقط. يراجع المنظمون الحسابات الجديدة؛ حاول مجدداً بعد التوثيق.');
  if (t.countries.length && !t.countries.includes(player.country)) return msg(l, 'This tournament isn’t open to players in your country.', 'هذه البطولة غير متاحة للاعبين في بلدك.');
  const mine = await prisma.entryMember.findFirst({ where: { playerId: player.id, entry: { tournamentId: t.id, status: { in: [...ACTIVE_ENTRY] } } } });
  if (mine) return msg(l, 'You’re already registered for this tournament.', 'أنت مسجّل في هذه البطولة بالفعل.');
  return null;
}

async function placesLeft(t: Tournament) {
  const taken = await prisma.entry.count({ where: { tournamentId: t.id, status: { in: [...ACTIVE_ENTRY] } } });
  return t.capacity - taken;
}

/** Fee and total for one entry; the platform fee is always added on top. */
export function entryPrice(t: Pick<Tournament, 'entryFeeMinor' | 'currency'>) {
  if (!t.entryFeeMinor) return { amountMinor: 0, feeMinor: 0, totalMinor: 0 };
  const fee = isCurrency(t.currency) ? ticketFee(t.entryFeeMinor, t.currency) : 0;
  return { amountMinor: t.entryFeeMinor, feeMinor: fee, totalMinor: t.entryFeeMinor + fee };
}

/**
 * Registers a player (solo) or creates a team with the player as captain.
 * Paid entries are held as PENDING_PAYMENT until the fee is paid. The
 * tournament row is locked so the last place can't be taken twice.
 */
export async function register(t: Tournament, player: PlayPlayer, opts: { teamName?: string; locale: L }) {
  const l = opts.locale;
  const block = await entryBlock(t, player, l);
  if (block) throw new EntryError(block);
  const project = await prisma.playProject.findUniqueOrThrow({ where: { id: t.projectId }, include: { organisation: true } });
  const access = await playAccess(project.organisation);
  if (!access.open) throw new EntryError(msg(l, 'Registration is paused on this website. Contact the organisers.', 'التسجيل متوقف مؤقتاً على هذا الموقع. تواصل مع المنظمين.'));
  const name = t.teamSize > 1 ? (opts.teamName ?? '').trim() : player.gamerTag;
  if (t.teamSize > 1 && !/^[\p{L}\p{N}_.\- ]{2,32}$/u.test(name)) throw new EntryError(msg(l, 'Give your team a name of 2 to 32 letters or numbers.', 'اختر اسماً لفريقك من 2 إلى 32 حرفاً أو رقماً.'));
  const price = entryPrice(t);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Tournament" WHERE id = ${t.id} FOR UPDATE`;
    if ((await placesLeft(t)) <= 0) throw new EntryError(msg(l, 'This tournament is full.', 'اكتملت هذه البطولة.'));
    if (await tx.entry.findFirst({ where: { tournamentId: t.id, name, status: { in: [...ACTIVE_ENTRY] } } })) {
      throw new EntryError(msg(l, `There’s already an entry called ${name}. Choose another name.`, `يوجد مشارك باسم ${name}. اختر اسماً آخر.`));
    }
    // A withdrawn entry with the same name frees its name for reuse.
    await tx.entry.deleteMany({ where: { tournamentId: t.id, name, status: { notIn: [...ACTIVE_ENTRY] } } });
    const entry = await tx.entry.create({
      data: {
        tournamentId: t.id, name, captainId: player.id, status: price.totalMinor ? 'PENDING_PAYMENT' : 'REGISTERED',
        joinCode: t.teamSize > 1 ? randomBytes(4).toString('hex').toUpperCase() : '',
        members: { create: { playerId: player.id } },
      },
    });
    return { entry, price };
  });
}

/** A teammate joins with the captain's code. */
export async function joinTeam(t: Tournament, player: PlayPlayer, code: string, l: L) {
  const block = await entryBlock(t, player, l);
  if (block) throw new EntryError(block);
  return prisma.$transaction(async (tx) => {
    const entry = await tx.entry.findFirst({ where: { tournamentId: t.id, joinCode: code.trim().toUpperCase(), status: { in: [...ACTIVE_ENTRY] } }, include: { _count: { select: { members: true } } } });
    if (!entry) throw new EntryError(msg(l, 'That team code doesn’t match a team in this tournament. Check it with your captain.', 'رمز الفريق لا يطابق أي فريق في هذه البطولة. تحقق منه مع قائد الفريق.'));
    if (entry._count.members >= t.teamSize) throw new EntryError(msg(l, `${entry.name} is already full.`, `فريق ${entry.name} مكتمل.`));
    await tx.entryMember.create({ data: { entryId: entry.id, playerId: player.id } });
    return entry;
  });
}

/** Leaving before the start. A captain leaving withdraws the whole team. */
export async function withdraw(t: Tournament, player: PlayPlayer, l: L) {
  if (t.status !== 'PUBLISHED') throw new EntryError(msg(l, 'The tournament has started, so you can’t withdraw here. Contact the organisers.', 'بدأت البطولة، لذلك لا يمكنك الانسحاب من هنا. تواصل مع المنظمين.'));
  const m = await prisma.entryMember.findFirst({ where: { playerId: player.id, entry: { tournamentId: t.id, status: { in: [...ACTIVE_ENTRY] } } }, include: { entry: true } });
  if (!m) throw new EntryError(msg(l, 'You’re not registered for this tournament.', 'أنت غير مسجّل في هذه البطولة.'));
  if (m.entry.captainId === player.id) await prisma.entry.update({ where: { id: m.entryId }, data: { status: 'WITHDRAWN' } });
  else await prisma.entryMember.delete({ where: { id: m.id } });
  return m.entry;
}

export async function checkIn(t: Tournament, player: PlayPlayer, l: L) {
  if (!checkInOpen(t)) throw new EntryError(msg(l, `Check-in opens ${CHECK_IN_MINUTES} minutes before the start.`, `يفتح تسجيل الحضور قبل البدء بـ ${CHECK_IN_MINUTES} دقيقة.`));
  const m = await prisma.entryMember.findFirst({ where: { playerId: player.id, entry: { tournamentId: t.id, status: 'REGISTERED' } }, include: { entry: { include: { _count: { select: { members: true } } } } } });
  if (!m) throw new EntryError(msg(l, 'You’re not registered, or you’ve already checked in.', 'أنت غير مسجّل أو سجّلت حضورك بالفعل.'));
  if (m.entry._count.members < t.teamSize) throw new EntryError(msg(l, `Your team needs ${t.teamSize} players to check in. Share the team code with your teammates.`, `يحتاج فريقك إلى ${t.teamSize} لاعبين لتسجيل الحضور. شارك رمز الفريق مع زملائك.`));
  await prisma.entry.update({ where: { id: m.entryId }, data: { status: 'CHECKED_IN' } });
}

export { placesLeft };
