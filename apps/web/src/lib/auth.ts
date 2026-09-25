import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { prisma, type Role } from '@zemmz/db';

export const SESSION_COOKIE = 'zemmz_session';
/** Which of the user's organisations the dashboard is showing. */
export const ORG_COOKIE = 'zemmz_org';
const SESSION_DAYS = 14;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await prisma.authSession.create({ data: { tokenHash: sha256(token), userId, expiresAt } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.authSession.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  organisationId: string;
  organisationName: string;
  role: Role;
  /** Every organisation this person belongs to, for the switcher. */
  organisations: { id: string; name: string; role: Role }[];
}

/**
 * Whoever holds a valid session cookie, even before they have an
 * organisation: someone part-way through signing up. Cached per request.
 */
export const getSessionAccount = cache(async () => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.authSession.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { memberships: { include: { organisation: true }, orderBy: { createdAt: 'asc' } } } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
});

/** The signed-in user and their organisation, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const user = await getSessionAccount();
  if (!user || !user.memberships.length || !user.emailVerifiedAt) return null;
  const chosen = (await cookies()).get(ORG_COOKIE)?.value;
  const m = user.memberships.find((x) => x.organisationId === chosen) ?? user.memberships[0];
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    organisationId: m.organisationId,
    organisationName: m.organisation.name,
    role: m.role,
    organisations: user.memberships.map((x) => ({ id: x.organisationId, name: x.organisation.name, role: x.role })),
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    // Signed in but not finished signing up: carry on where they left off.
    if (await getSessionAccount()) redirect('/signup');
    redirect('/login');
  }
  return user;
}

/** zemmz staff who can activate plans, from PLATFORM_ADMIN_EMAILS (comma-separated). */
export function isPlatformAdmin(email: string) {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
}

/** What each role may do. Check-in staff only reach the check-in console. */
export const can = {
  manageEvent: (r: Role) => r === 'OWNER' || r === 'ADMIN',
  editContent: (r: Role) => r === 'OWNER' || r === 'ADMIN' || r === 'EDITOR',
  editRegistrations: (r: Role) => r === 'OWNER' || r === 'ADMIN' || r === 'EDITOR',
  sendMessages: (r: Role) => r === 'OWNER' || r === 'ADMIN' || r === 'EDITOR',
  checkIn: (_r: Role) => true,
  seeDashboard: (r: Role) => r !== 'CHECKIN',
};

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  EDITOR: 'Content editor',
  CHECKIN: 'Check-in staff',
};

/**
 * Loads an event the user may access, or 404s. Scoped by organisation, so
 * a guessed slug from another organisation behaves exactly like a missing one.
 */
export const requireEvent = cache(async (slug: string) => {
  const user = await requireUser();
  const event = await prisma.event.findFirst({ where: { slug, organisationId: user.organisationId } });
  if (!event) {
    // A link to an event in another of their organisations: switch to it.
    const other = await prisma.event.findFirst({ where: { slug, organisationId: { in: user.organisations.map((o) => o.id) } }, select: { organisationId: true } });
    if (other) redirect(`/switch?org=${other.organisationId}&next=${encodeURIComponent(`/events/${slug}`)}`);
    notFound();
  }
  return { user, event };
});

export async function requirePermission(slug: string, check: (r: Role) => boolean) {
  const ctx = await requireEvent(slug);
  if (!check(ctx.user.role)) {
    redirect(ctx.user.role === 'CHECKIN' ? `/events/${slug}/check-in` : `/events/${slug}`);
  }
  return ctx;
}
