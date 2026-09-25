'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@zemmz/db';
import { ORG_COOKIE, requireUser } from '@/lib/auth';
import { failed, type ActionState } from '@/lib/action-state';
import { orgSlug } from '@/lib/onboarding';

/** A second organisation for someone who already has one, e.g. an agency's client. It starts on the free trial. */
export async function createAnotherOrganisation(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const name = String(fd.get('name') ?? '').trim();
  if (name.length < 2 || name.length > 120) return failed('Enter the organisation’s name.');
  if (user.organisations.length >= 20) return failed('You’re in 20 organisations already. Contact us if you need more.');
  const slug = await orgSlug(name, async (s) => !!(await prisma.organisation.findUnique({ where: { slug: s } })));
  const org = await prisma.organisation.create({
    data: {
      name, slug, kind: String(fd.get('kind') ?? '').slice(0, 60), country: String(fd.get('country') ?? '').slice(0, 60), planStatus: 'TRIAL',
      memberships: { create: { userId: user.id, role: 'OWNER' } },
      activity: { create: { actorId: user.id, actorLabel: user.name, action: `created the organisation ${name}` } },
    },
  });
  (await cookies()).set(ORG_COOKIE, org.id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 365 });
  redirect('/events/new');
}
