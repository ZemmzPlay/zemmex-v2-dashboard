'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { hashPassword, prisma, verifyPassword } from '@zemmz/db';
import { emailSchema } from '@zemmz/shared';
import { createSession, getCurrentUser } from '@/lib/auth';
import { findInvitation, findReset, passwordProblem, startPasswordReset } from '@/lib/accounts';
import { rateLimit } from '@/lib/rate-limit';

export interface AuthFormState {
  error?: string;
  ok?: string;
  values?: Record<string, string>;
}

const ip = async () => (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';

export async function requestReset(_p: AuthFormState, fd: FormData): Promise<AuthFormState> {
  const parsed = emailSchema.safeParse(fd.get('email'));
  if (!parsed.success) return { error: 'Enter the email you sign in with.', values: { email: String(fd.get('email') ?? '') } };
  if (!rateLimit(`reset:${await ip()}`, 5, 15 * 60_000) || !rateLimit(`reset:${parsed.data}`, 3, 15 * 60_000)) {
    return { error: 'Too many requests. Wait fifteen minutes and try again.' };
  }
  await startPasswordReset(parsed.data);
  // The same answer whether or not the email has an account.
  return { ok: `If ${parsed.data} has an account, a link to reset the password is on its way. It works for 2 hours.` };
}

export async function resetPassword(token: string, _p: AuthFormState, fd: FormData): Promise<AuthFormState> {
  const r = await findReset(token);
  if (!r) return { error: 'This link has expired or was already used. Ask for a new one.' };
  const pw = String(fd.get('password') ?? '');
  const bad = passwordProblem(pw);
  if (bad) return { error: bad };
  if (pw !== String(fd.get('confirm') ?? '')) return { error: 'The two passwords don’t match.' };
  await prisma.$transaction([
    prisma.user.update({ where: { id: r.userId }, data: { passwordHash: await hashPassword(pw) } }),
    prisma.passwordReset.update({ where: { id: r.id }, data: { usedAt: new Date() } }),
    // Everyone signed in with the old password is signed out.
    prisma.authSession.deleteMany({ where: { userId: r.userId } }),
  ]);
  redirect('/login?reset=1');
}

/**
 * Accepting an invitation: a new person sets a name and password; someone
 * with an account signs in with it. An account belongs to one organisation.
 */
export async function acceptInvitation(token: string, _p: AuthFormState, fd: FormData): Promise<AuthFormState> {
  const inv = await findInvitation(token);
  if (!inv) return { error: 'This invitation has expired or was already used. Ask for a new one.' };
  if (!rateLimit(`invite:${await ip()}`, 10, 10 * 60_000)) return { error: 'Too many attempts. Wait ten minutes and try again.' };
  const current = await getCurrentUser();
  const existing = await prisma.user.findUnique({ where: { email: inv.email }, include: { memberships: true } });
  const values = { name: String(fd.get('name') ?? '') };

  let userId: string;
  if (existing) {
    if (existing.memberships.some((m) => m.organisationId !== inv.organisationId)) {
      return { error: `${inv.email} already belongs to another organisation. For now an account can be in one organisation; ask ${inv.invitedByLabel || 'the person who invited you'} to invite a different email.` };
    }
    if (current?.id !== existing.id) {
      const ok = await verifyPassword(String(fd.get('password') ?? ''), existing.passwordHash);
      if (!ok) return { error: 'That password doesn’t match this account. Use Forgot password on the sign-in page if you need a new one.', values };
    }
    userId = existing.id;
  } else {
    const name = values.name.trim();
    if (name.length < 2) return { error: 'Enter your name.', values };
    const pw = String(fd.get('password') ?? '');
    const bad = passwordProblem(pw);
    if (bad) return { error: bad, values };
    const u = await prisma.user.create({ data: { name: name.slice(0, 120), email: inv.email, passwordHash: await hashPassword(pw), emailVerifiedAt: new Date() } });
    userId = u.id;
  }
  await prisma.$transaction([
    prisma.membership.upsert({
      where: { userId_organisationId: { userId, organisationId: inv.organisationId } },
      update: {},
      create: { userId, organisationId: inv.organisationId, role: inv.role },
    }),
    prisma.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } }),
    prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date(), lastSeenAt: new Date() } }),
    prisma.activityLog.create({ data: { organisationId: inv.organisationId, actorId: userId, actorLabel: existing?.name ?? values.name.trim(), action: `joined the organisation as ${inv.role === 'CHECKIN' ? 'check-in staff' : inv.role.toLowerCase()}` } }),
  ]);
  if (current?.id !== userId) await createSession(userId);
  redirect('/events');
}
