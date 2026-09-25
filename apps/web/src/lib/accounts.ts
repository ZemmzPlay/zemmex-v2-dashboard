import 'server-only';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { prisma, type Role } from '@zemmz/db';
import { platformEmail } from '@zemmz/shared';

export { platformEmail };
import { appUrl } from './email';

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');

export const RESET_HOURS = 2;
export const INVITE_DAYS = 7;
export const CODE_MINUTES = 15;

/** Passwords: at least 8 characters with a number, as the signup form says. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 8 || !/\d/.test(pw)) return 'Use at least 8 characters, including a number.';
  if (pw.length > 200) return 'That password is too long.';
  return null;
}

export async function queuePlatformEmail(to: { email: string; name?: string }, subject: string, body: ReturnType<typeof platformEmail>) {
  await prisma.outboundMessage.create({ data: { channel: 'EMAIL', toAddress: to.email, toName: to.name ?? '', subject, html: body.html, text: body.text } });
}

export async function startPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;
  const token = newToken();
  await prisma.passwordReset.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_HOURS * 3_600_000) } });
  await queuePlatformEmail(user, 'Reset your zemmz Live password', platformEmail({
    heading: 'Reset your password',
    paragraphs: [`Hi ${user.name.split(' ')[0]},`, `Someone asked to reset the password for ${user.email}. The link works for ${RESET_HOURS} hours and only once.`],
    button: { label: 'Choose a new password', url: `${appUrl()}/reset/${token}` },
    footer: 'If you didn’t ask for this, ignore this email. Your password stays the same.',
  }));
}

/** A usable reset for this token, or null when it's unknown, used or expired. */
export async function findReset(token: string) {
  const r = await prisma.passwordReset.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  return r && !r.usedAt && r.expiresAt > new Date() ? r : null;
}

export const ROLE_NOTE: Record<Role, string> = {
  OWNER: 'Everything, including who has access and the plan',
  ADMIN: 'Everything except changing owners',
  EDITOR: 'Registrations, messages, content and the website',
  CHECKIN: 'Only the check-in console and printing badges',
};

export async function sendInvitation(opts: { organisationId: string; organisationName: string; email: string; role: Role; invitedBy: { id: string; name: string } }) {
  const token = newToken();
  // A new invitation replaces any earlier one for the same email.
  await prisma.invitation.deleteMany({ where: { organisationId: opts.organisationId, email: opts.email, acceptedAt: null } });
  await prisma.invitation.create({
    data: { organisationId: opts.organisationId, email: opts.email, role: opts.role, tokenHash: sha256(token), invitedById: opts.invitedBy.id, invitedByLabel: opts.invitedBy.name, expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000) },
  });
  await queuePlatformEmail({ email: opts.email }, `${opts.invitedBy.name} invited you to ${opts.organisationName} on zemmz Live`, platformEmail({
    heading: `Join ${opts.organisationName} on zemmz Live`,
    paragraphs: [`${opts.invitedBy.name} invited you as ${ROLE_LABEL_LOWER[opts.role]}: ${ROLE_NOTE[opts.role].toLowerCase()}.`, `The invitation works for ${INVITE_DAYS} days.`],
    button: { label: 'Accept the invitation', url: `${appUrl()}/invite/${token}` },
  }));
}

const ROLE_LABEL_LOWER: Record<Role, string> = { OWNER: 'an owner', ADMIN: 'an admin', EDITOR: 'a content editor', CHECKIN: 'check-in staff' };

export async function findInvitation(token: string) {
  const inv = await prisma.invitation.findUnique({ where: { tokenHash: sha256(token) }, include: { organisation: true } });
  return inv && !inv.acceptedAt && inv.expiresAt > new Date() ? inv : null;
}

/** Six digits, never starting with 0 so it reads as a number. */
export function sixDigits() {
  return String(randomInt(100000, 1000000));
}
