'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma, type Role } from '@zemmz/db';
import { emailSchema } from '@zemmz/shared';
import { can, requireUser, ROLE_LABEL } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { sendInvitation } from '@/lib/accounts';
import { done, failed, type ActionState } from '@/lib/action-state';

const ROLES = ['OWNER', 'ADMIN', 'EDITOR', 'CHECKIN'] as const;

async function manager() {
  const user = await requireUser();
  if (!can.manageEvent(user.role)) throw new Error('Only owners and admins manage people.');
  return user;
}

/** Owners can grant anything; admins can't create or change owners. */
const mayGrant = (actor: Role, role: Role) => actor === 'OWNER' || role !== 'OWNER';

export async function invite(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await manager();
  const email = emailSchema.safeParse(fd.get('email'));
  if (!email.success) return failed('Enter a valid email address.');
  const role = z.enum(ROLES).safeParse(fd.get('role'));
  if (!role.success) return failed('Choose a role.');
  if (!mayGrant(user.role, role.data)) return failed('Only an owner can invite another owner.');
  const existing = await prisma.user.findUnique({ where: { email: email.data }, include: { memberships: true } });
  if (existing?.memberships.some((m) => m.organisationId === user.organisationId)) return failed(`${email.data} already has access.`);
  if (existing?.memberships.length) return failed(`${email.data} belongs to another organisation. For now an account can be in one organisation.`);
  await sendInvitation({ organisationId: user.organisationId, organisationName: user.organisationName, email: email.data, role: role.data, invitedBy: user });
  await logActivity(user, null, `invited ${email.data} as ${ROLE_LABEL[role.data].toLowerCase()}`);
  revalidatePath('/organisation');
  return done(`Invitation sent to ${email.data}.`);
}

export async function resendInvite(fd: FormData) {
  const user = await manager();
  const inv = await prisma.invitation.findFirst({ where: { id: String(fd.get('id') ?? ''), organisationId: user.organisationId, acceptedAt: null } });
  if (!inv || !mayGrant(user.role, inv.role)) return;
  await sendInvitation({ organisationId: user.organisationId, organisationName: user.organisationName, email: inv.email, role: inv.role, invitedBy: user });
  await logActivity(user, null, `sent the invitation to ${inv.email} again`);
  revalidatePath('/organisation');
}

export async function revokeInvite(fd: FormData) {
  const user = await manager();
  const inv = await prisma.invitation.findFirst({ where: { id: String(fd.get('id') ?? ''), organisationId: user.organisationId, acceptedAt: null } });
  if (!inv) return;
  await prisma.invitation.delete({ where: { id: inv.id } });
  await logActivity(user, null, `cancelled the invitation to ${inv.email}`);
  revalidatePath('/organisation');
}

async function ownerCount(organisationId: string) {
  return prisma.membership.count({ where: { organisationId, role: 'OWNER' } });
}

export async function changeRole(membershipId: string, role: string): Promise<ActionState> {
  const user = await manager();
  const r = z.enum(ROLES).safeParse(role);
  if (!r.success) return failed('Choose a role.');
  const m = await prisma.membership.findFirst({ where: { id: membershipId, organisationId: user.organisationId }, include: { user: true } });
  if (!m) return failed('That person no longer has access.');
  if (m.userId === user.id) return failed('You can’t change your own role. Ask another owner.');
  if (!mayGrant(user.role, r.data) || !mayGrant(user.role, m.role)) return failed('Only an owner can change who is an owner.');
  if (m.role === 'OWNER' && r.data !== 'OWNER' && (await ownerCount(user.organisationId)) <= 1) return failed('Every organisation needs at least one owner.');
  await prisma.membership.update({ where: { id: m.id }, data: { role: r.data } });
  await logActivity(user, null, `changed ${m.user.name} from ${ROLE_LABEL[m.role].toLowerCase()} to ${ROLE_LABEL[r.data].toLowerCase()}`);
  revalidatePath('/organisation');
  return done(`${m.user.name} is now ${ROLE_LABEL[r.data].toLowerCase()}.`);
}

export async function removeMember(fd: FormData) {
  const user = await manager();
  const m = await prisma.membership.findFirst({ where: { id: String(fd.get('id') ?? ''), organisationId: user.organisationId }, include: { user: true } });
  if (!m || m.userId === user.id || !mayGrant(user.role, m.role)) return;
  if (m.role === 'OWNER' && (await ownerCount(user.organisationId)) <= 1) return;
  await prisma.$transaction([
    prisma.membership.delete({ where: { id: m.id } }),
    // Signed out straight away on every device.
    prisma.authSession.deleteMany({ where: { userId: m.userId } }),
  ]);
  await logActivity(user, null, `removed ${m.user.name} (${m.user.email})`);
  revalidatePath('/organisation');
}

const orgSchema = z.object({
  name: z.string().trim().min(2, 'Enter your organisation’s name').max(120),
  kind: z.string().trim().max(60).default(''),
  country: z.string().trim().max(60).default(''),
});

export async function saveOrganisation(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await manager();
  const parsed = orgSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return failed(parsed.error.issues[0].message);
  await prisma.organisation.update({ where: { id: user.organisationId }, data: parsed.data });
  await logActivity(user, null, 'edited the organisation details');
  revalidatePath('/', 'layout');
  return done('Saved.');
}
