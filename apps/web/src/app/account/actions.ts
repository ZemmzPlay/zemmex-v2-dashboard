'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { hashPassword, prisma, verifyPassword } from '@zemmz/db';
import { requireUser, SESSION_COOKIE } from '@/lib/auth';
import { passwordProblem, sha256 } from '@/lib/accounts';
import { done, failed, type ActionState } from '@/lib/action-state';

export async function saveProfile(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const name = String(fd.get('name') ?? '').trim();
  if (name.length < 2 || name.length > 120) return failed('Enter your name.');
  await prisma.user.update({ where: { id: user.id }, data: { name } });
  revalidatePath('/', 'layout');
  return done('Saved.');
}

export async function changePassword(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(String(fd.get('current') ?? ''), row.passwordHash))) return failed('Your current password isn’t right.');
  const pw = String(fd.get('password') ?? '');
  const bad = passwordProblem(pw);
  if (bad) return failed(bad);
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? '';
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(pw) } }),
    // Other devices are signed out; this one stays signed in.
    prisma.authSession.deleteMany({ where: { userId: user.id, NOT: { tokenHash: sha256(token) } } }),
  ]);
  return done('Password changed. You’ve been signed out on other devices.');
}

export async function signOutEverywhereElse() {
  const user = await requireUser();
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? '';
  await prisma.authSession.deleteMany({ where: { userId: user.id, NOT: { tokenHash: sha256(token) } } });
  revalidatePath('/account');
}
