import 'server-only';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { prisma, type PlayPlayer, type PlayProject } from '@zemmz/db';
import { platformEmail } from '@zemmz/shared';

/**
 * Players sign in to a tournament website with a one-time code, sent by SMS
 * to their phone or by email: there are no player passwords. Each website has
 * its own players and its own session cookie, scoped to its path.
 */
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const CODE_MINUTES = 10;
const SESSION_DAYS = 60;
const cookieName = (projectId: string) => `zplay_${projectId.slice(-10)}`;

export class PlayerAuthError extends Error {}

/** An email address, or a phone number in international form (+965…). */
export function normaliseTarget(input: string): { kind: 'email' | 'phone'; value: string } | null {
  const v = input.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { kind: 'email', value: v.toLowerCase() };
  const digits = v.replace(/[^\d+]/g, '');
  if (/^\+\d{8,15}$/.test(digits)) return { kind: 'phone', value: digits };
  return null;
}

/** SMS needs a provider on the server; in development the outbox stands in. */
export const smsReady = () => !!process.env.SMS_PROVIDER || (process.env.MESSAGING_PROVIDER ?? 'log') === 'log';

export async function sendPlayerCode(project: PlayProject, target: { kind: 'email' | 'phone'; value: string }, locale: 'en' | 'ar') {
  if (target.kind === 'phone' && !smsReady()) throw new PlayerAuthError(locale === 'ar' ? 'لا يمكن إرسال رسائل نصية الآن. استخدم بريدك الإلكتروني.' : 'Text messages aren’t available right now. Use your email address instead.');
  const recent = await prisma.playerCode.count({ where: { projectId: project.id, target: target.value, createdAt: { gt: new Date(Date.now() - 15 * 60_000) } } });
  if (recent >= 5) throw new PlayerAuthError(locale === 'ar' ? 'أرسلنا عدة رموز. انتظر بضع دقائق.' : 'We’ve sent several codes. Wait a few minutes and try again.');
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await prisma.playerCode.create({ data: { projectId: project.id, target: target.value, codeHash: sha256(`${project.id}:${target.value}:${code}`), expiresAt: new Date(Date.now() + CODE_MINUTES * 60_000) } });
  const name = project.name;
  if (target.kind === 'phone') {
    const text = locale === 'ar' ? `${code} هو رمزك في ${name}. صالح لمدة ${CODE_MINUTES} دقائق.` : `${code} is your ${name} code. It works for ${CODE_MINUTES} minutes.`;
    await prisma.outboundMessage.create({ data: { channel: 'SMS', toAddress: target.value, subject: name, html: '', text } });
  } else {
    const body = platformEmail({
      heading: locale === 'ar' ? 'رمز الدخول' : 'Your sign-in code',
      paragraphs: [locale === 'ar' ? `أدخل هذا الرمز على موقع ${name}. صالح لمدة ${CODE_MINUTES} دقائق.` : `Enter this code on the ${name} website. It works for ${CODE_MINUTES} minutes.`],
      code,
      footer: locale === 'ar' ? 'إن لم تطلب هذا الرمز فتجاهل هذه الرسالة.' : 'If you didn’t ask for this code, ignore this email.',
    });
    await prisma.outboundMessage.create({ data: { channel: 'EMAIL', toAddress: target.value, subject: `${code} is your ${name} code`, html: body.html, text: body.text } });
  }
}

/** Checks a code; five wrong tries and it stops working. */
export async function checkPlayerCode(projectId: string, target: string, code: string): Promise<boolean> {
  const row = await prisma.playerCode.findFirst({ where: { projectId, target, usedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
  if (!row || row.attempts >= 5) return false;
  if (row.codeHash !== sha256(`${projectId}:${target}:${code.replace(/\D/g, '')}`)) {
    await prisma.playerCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    return false;
  }
  await prisma.playerCode.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  return true;
}

export async function startPlayerSession(project: PlayProject, playerId: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await prisma.playerSession.create({ data: { playerId, tokenHash: sha256(token), expiresAt } });
  await prisma.playPlayer.update({ where: { id: playerId }, data: { lastSeenAt: new Date() } });
  (await cookies()).set(cookieName(project.id), token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', expires: expiresAt });
}

export async function endPlayerSession(project: PlayProject) {
  const jar = await cookies();
  const token = jar.get(cookieName(project.id))?.value;
  if (token) await prisma.playerSession.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(cookieName(project.id));
}

/** The signed-in player on this website, or null. Blacklisted players are signed out. */
export const currentPlayer = cache(async (projectId: string): Promise<PlayPlayer | null> => {
  const token = (await cookies()).get(cookieName(projectId))?.value;
  if (!token) return null;
  const s = await prisma.playerSession.findUnique({ where: { tokenHash: sha256(token) }, include: { player: true } });
  if (!s || s.expiresAt < new Date() || s.player.projectId !== projectId || s.player.blacklisted) return null;
  return s.player;
});

export const gamerTagProblem = (tag: string, locale: 'en' | 'ar') =>
  !/^[\p{L}\p{N}_.\- ]{2,24}$/u.test(tag) ? (locale === 'ar' ? 'اسم اللاعب من 2 إلى 24 حرفاً أو رقماً.' : 'Gamer tags are 2 to 24 letters, numbers, spaces, dots, dashes or underscores.') : null;
