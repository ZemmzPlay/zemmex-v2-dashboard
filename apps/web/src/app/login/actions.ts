'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { prisma, verifyPassword } from '@zemmz/db';
import { loginSchema } from '@zemmz/shared';
import { createSession, destroySession } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';

export interface LoginState {
  error?: string;
  email?: string;
}

// A fixed hash so unknown emails take as long as wrong passwords.
const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86) + '==';

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({ email: form.get('email'), password: form.get('password') });
  const email = String(form.get('email') ?? '');
  if (!parsed.success) return { error: parsed.error.issues[0].message, email };

  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (!rateLimit(`login:${ip}`, 10, 10 * 60_000) || !rateLimit(`login:${parsed.data.email}`, 8, 10 * 60_000)) {
    return { error: 'Too many attempts. Wait ten minutes and try again.', email };
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) return { error: 'That email and password don’t match. Check both and try again.', email };

  await createSession(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
  const membership = await prisma.membership.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });

  const next = String(form.get('next') ?? '');
  if (next.startsWith('/') && !next.startsWith('//')) redirect(next);
  if (membership?.role === 'CHECKIN') {
    const first = await prisma.event.findFirst({ where: { organisationId: membership.organisationId, sessions: { some: { status: 'LIVE' } } } });
    if (first) redirect(`/events/${first.slug}/check-in`);
  }
  redirect('/events');
}

export async function logout() {
  await destroySession();
  redirect('/login');
}
