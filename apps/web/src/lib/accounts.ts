import 'server-only';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { prisma, type Role } from '@zemmz/db';
import { escapeHtml } from '@zemmz/shared';
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

/** zemmz's own emails (reset, invitation, code): plain, with one button. */
export function platformEmail(opts: { heading: string; paragraphs: string[]; button?: { label: string; url: string }; code?: string; footer?: string }) {
  const p = opts.paragraphs.map((t) => `<p style="margin:0 0 14px">${escapeHtml(t)}</p>`).join('');
  const button = opts.button
    ? `<p style="margin:22px 0"><a href="${escapeHtml(opts.button.url)}" style="display:inline-block;background:#0B5CFF;color:#FFFFFF;font:600 15px Arial,sans-serif;text-decoration:none;padding:12px 20px;border-radius:10px">${escapeHtml(opts.button.label)}</a></p>`
    : '';
  const code = opts.code ? `<p style="margin:18px 0;font:700 34px/1 Arial,sans-serif;letter-spacing:.3em;color:#00032E">${escapeHtml(opts.code)}</p>` : '';
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#F4F5FA">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5FA;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:14px;overflow:hidden">
<tr><td style="padding:22px 28px 0;font:800 22px Arial,sans-serif;letter-spacing:-.04em;color:#00032E">zemmz <span style="font:700 10px Arial,sans-serif;letter-spacing:.12em;color:#6B6A85">LIVE</span></td></tr>
<tr><td style="padding:18px 28px 10px;font:400 15px/1.6 Arial,sans-serif;color:#1F1D3D"><h1 style="font:700 20px/1.3 Arial,sans-serif;margin:0 0 14px;color:#00032E">${escapeHtml(opts.heading)}</h1>${p}${code}${button}</td></tr>
<tr><td style="padding:6px 28px 24px;font:400 12px/1.5 Arial,sans-serif;color:#6B6A85">${escapeHtml(opts.footer ?? 'You’re getting this because of an action on zemmz Live. If it wasn’t you, you can ignore this email.')}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [opts.heading, ...opts.paragraphs, opts.code ?? '', opts.button ? `${opts.button.label}: ${opts.button.url}` : ''].filter(Boolean).join('\n\n');
  return { html, text };
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
