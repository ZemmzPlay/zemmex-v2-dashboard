import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@zemmz/db';
import { createSession, getSessionAccount, ORG_COOKIE } from '@/lib/auth';
import { emailDomain, finishSso, isSsoProvider, ssoLabel, SSO_COOKIE, SsoError, unseal, type SsoState } from '@/lib/sso';
import { appUrl } from '@/lib/email';
import { sendEmailCode } from '@/lib/accounts';

/**
 * Back from Microsoft or Google. In order:
 *   1. an account already linked to this identity signs in;
 *   2. from Your account, the identity is linked to the signed-in person;
 *   3. an account with the same email is linked, only if the provider vouches for the email;
 *   4. otherwise a new account is made, joining the organisation that verified
 *      the email's domain for single sign-on, or carrying on to signup.
 */
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(req.url);
  const jar = await cookies();
  const cookie = unseal<SsoState>(jar.get(SSO_COOKIE)?.value);
  jar.delete({ name: SSO_COOKIE, path: '/auth' });
  const go = (path: string) => NextResponse.redirect(new URL(path, appUrl()), 303);
  const fail = (message: string) => go(`${cookie?.intent === 'link' ? '/account' : '/login'}?sso_error=${encodeURIComponent(message)}`);
  if (!isSsoProvider(provider)) return fail('That sign-in option isn’t available.');
  if (url.searchParams.get('error')) return fail(`${ssoLabel(provider)} sign-in was cancelled.`);

  let profile;
  try {
    profile = await finishSso(provider, url.searchParams.get('code') ?? '', url.searchParams.get('state') ?? '', cookie);
  } catch (e) {
    return fail(e instanceof SsoError ? e.message : `${ssoLabel(provider)} couldn’t be reached. Try again.`);
  }

  const now = new Date();
  const linked = await prisma.userIdentity.findUnique({ where: { provider_subject: { provider, subject: profile.subject } } });
  let userId: string;

  if (cookie!.intent === 'link') {
    const me = await getSessionAccount();
    if (!me) return go('/login');
    if (linked && linked.userId !== me.id) return fail(`That ${ssoLabel(provider)} account is already connected to someone else.`);
    if (!linked) await prisma.userIdentity.create({ data: { userId: me.id, provider, subject: profile.subject, email: profile.email } });
    return go('/account?sso=linked');
  }

  if (linked) {
    userId = linked.userId;
    await prisma.userIdentity.update({ where: { id: linked.id }, data: { lastUsedAt: now, email: profile.email } });
  } else {
    const existing = await prisma.user.findUnique({ where: { email: profile.email } });
    if (existing) {
      if (!profile.emailVerified) {
        return fail(`An account with ${profile.email} already exists. Sign in with your password, then connect ${ssoLabel(provider)} from Your account.`);
      }
      userId = existing.id;
      await prisma.userIdentity.create({ data: { userId, provider, subject: profile.subject, email: profile.email } });
      if (!existing.emailVerifiedAt) await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: now } });
    } else {
      const u = await prisma.user.create({
        data: {
          email: profile.email, name: profile.name, passwordHash: '', emailVerifiedAt: profile.emailVerified ? now : null,
          identities: { create: { provider, subject: profile.subject, email: profile.email, lastUsedAt: now } },
        },
      });
      userId = u.id;
      // Microsoft didn't vouch for the email: prove it with the usual code.
      if (!profile.emailVerified) await sendEmailCode(u);
    }
  }

  // Just-in-time membership for an organisation that verified this email domain.
  const org = profile.emailVerified
    ? await prisma.organisation.findFirst({ where: { ssoDomain: emailDomain(profile.email), ssoDomainVerifiedAt: { not: null } } })
    : null;
  if (org && !(await prisma.membership.findUnique({ where: { userId_organisationId: { userId, organisationId: org.id } } }))) {
    await prisma.membership.create({ data: { userId, organisationId: org.id, role: org.ssoDefaultRole } });
    await prisma.activityLog.create({ data: { organisationId: org.id, actorId: userId, actorLabel: profile.name, action: `joined through ${ssoLabel(provider)} single sign-on` } });
  }

  await createSession(userId);
  await prisma.user.update({ where: { id: userId }, data: { lastSeenAt: now } });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { memberships: { select: { organisationId: true } } } });
  if (!user.memberships.length || !user.emailVerifiedAt) return go('/signup');
  const res = go(cookie!.next);
  if (org) res.cookies.set(ORG_COOKIE, org.id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 365 });
  return res;
}
