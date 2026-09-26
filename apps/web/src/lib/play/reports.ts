import 'server-only';
import { prisma, type PlayPlayer, type PlayProject } from '@zemmz/db';
import { createId } from '@/lib/id';
import { LIMITS, sniff, storage } from '@/lib/storage';

export class ReportError extends Error {}
type L = 'en' | 'ar';
const msg = (l: L, en: string, ar: string) => (l === 'ar' ? ar : en);

/** The player's entry in a match, or null if they aren't playing in it. */
export async function playerSide(matchId: string, playerId: string) {
  const match = await prisma.match.findUnique({ where: { id: matchId }, include: { tournament: true } });
  if (!match) return null;
  const member = await prisma.entryMember.findFirst({ where: { playerId, entryId: { in: [match.entryAId, match.entryBId].filter(Boolean) as string[] } } });
  return member ? { match, entryId: member.entryId } : null;
}

/**
 * A player reports a result with a screenshot of the result screen. The
 * screenshot is checked by its bytes, stored privately, and the match goes to
 * the organisers' queue: REVIEW, or CONFLICT when the other side's report says
 * something different.
 */
export async function submitReport(opts: { project: PlayProject; player: PlayPlayer; matchId: string; scoreA: number; scoreB: number; file: File | null; locale: L }) {
  const l = opts.locale;
  const side = await playerSide(opts.matchId, opts.player.id);
  if (!side) throw new ReportError(msg(l, 'You’re not playing in that match.', 'أنت لست طرفاً في هذه المباراة.'));
  const { match } = side;
  if (!match.tournament.playersReport) throw new ReportError(msg(l, 'Only the organisers enter results in this tournament.', 'يُدخل المنظمون النتائج في هذه البطولة.'));
  if (match.tournament.status !== 'LIVE') throw new ReportError(msg(l, 'This tournament isn’t running.', 'هذه البطولة غير جارية.'));
  if (!['READY', 'REVIEW', 'CONFLICT', 'PROOF'].includes(match.status)) throw new ReportError(msg(l, 'This match can’t take a result right now.', 'لا يمكن إرسال نتيجة لهذه المباراة الآن.'));
  const { scoreA, scoreB } = opts;
  if (![scoreA, scoreB].every((n) => Number.isInteger(n) && n >= 0 && n <= 999)) throw new ReportError(msg(l, 'Scores are whole numbers.', 'النتائج أرقام صحيحة.'));
  if (scoreA === scoreB) throw new ReportError(msg(l, 'Matches can’t end level. Enter the deciding result.', 'لا يمكن أن تنتهي المباراة بالتعادل. أدخل النتيجة الحاسمة.'));
  if (!opts.file || !opts.file.size) throw new ReportError(msg(l, 'Upload a screenshot of the result screen.', 'ارفع صورة لشاشة النتيجة.'));
  const head = new Uint8Array(await opts.file.slice(0, 16).arrayBuffer());
  const kind = sniff(head);
  if (!kind || kind.kind !== 'image') throw new ReportError(msg(l, 'The screenshot must be a PNG, JPG or WebP image.', 'يجب أن تكون الصورة بصيغة PNG أو JPG أو WebP.'));
  if (opts.file.size > LIMITS.image * 2) throw new ReportError(msg(l, 'That screenshot is over 10 MB. Take a smaller one.', 'حجم الصورة أكبر من 10 ميغابايت.'));

  const key = `${opts.project.organisationId}/play/${opts.project.id}/screenshots/${createId()}.${kind.ext}`;
  await storage().put(key, new Uint8Array(await opts.file.arrayBuffer()), kind.type);
  const asset = await prisma.asset.create({ data: { organisationId: opts.project.organisationId, playProjectId: opts.project.id, kind: 'SCREENSHOT', key, name: `${match.id}-${side.entryId}.${kind.ext}`, contentType: kind.type, size: opts.file.size } });

  await prisma.$transaction(async (tx) => {
    await tx.scoreReport.updateMany({ where: { matchId: match.id, entryId: side.entryId, replaced: false }, data: { replaced: true } });
    await tx.scoreReport.create({ data: { matchId: match.id, entryId: side.entryId, playerId: opts.player.id, scoreA, scoreB, screenshotAssetId: asset.id } });
    const current = await tx.scoreReport.findMany({ where: { matchId: match.id, replaced: false } });
    const disagree = current.length > 1 && current.some((r) => r.scoreA !== current[0].scoreA || r.scoreB !== current[0].scoreB);
    await tx.match.update({ where: { id: match.id }, data: { status: disagree ? 'CONFLICT' : 'REVIEW' } });
  });
}

/** The organisers ask for a clearer screenshot; earlier ones stay on record. */
export async function requestProof(matchId: string) {
  await prisma.$transaction([
    prisma.scoreReport.updateMany({ where: { matchId, replaced: false }, data: { replaced: true } }),
    prisma.match.update({ where: { id: matchId }, data: { status: 'PROOF' } }),
  ]);
}

/** Why a report needs a human: the queue's labels. */
export const REPORT_STATE: Record<string, { en: string; badge: string }> = {
  REVIEW: { en: 'Needs review', badge: 'b-warn' },
  CONFLICT: { en: 'Scores don’t match', badge: 'b-danger' },
  PROOF: { en: 'New screenshot asked for', badge: 'b-info' },
  CONFIRMED: { en: 'Confirmed', badge: 'b-ok' },
};
