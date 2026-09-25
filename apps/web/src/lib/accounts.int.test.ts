import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@zemmz/db';
import { makeEvent, resetDb } from '../../../../tests/factory';
import { findInvitation, findReset, passwordProblem, sendInvitation, startPasswordReset } from './accounts';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const linkIn = (text: string, path: string) => text.match(new RegExp(`${path}([A-Za-z0-9_-]+)`))?.[1] ?? '';

describe('password reset', () => {
  it('emails a single-use link that expires', async () => {
    const { user } = await makeEvent();
    await startPasswordReset(user.email);
    const mail = await prisma.outboundMessage.findFirstOrThrow({ where: { toAddress: user.email } });
    const token = linkIn(mail.text, '/reset/');
    expect(token.length).toBeGreaterThan(30);
    const r = await findReset(token);
    expect(r?.userId).toBe(user.id);
    // Only the hash is stored.
    expect(await prisma.passwordReset.count({ where: { tokenHash: token } })).toBe(0);
    await prisma.passwordReset.update({ where: { id: r!.id }, data: { usedAt: new Date() } });
    expect(await findReset(token)).toBeNull();
  });

  it('does nothing, and says nothing, for an unknown email', async () => {
    await startPasswordReset('nobody@example.com');
    expect(await prisma.outboundMessage.count()).toBe(0);
  });

  it('refuses expired links', async () => {
    const { user } = await makeEvent();
    await startPasswordReset(user.email);
    const mail = await prisma.outboundMessage.findFirstOrThrow({ where: { toAddress: user.email } });
    await prisma.passwordReset.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await findReset(linkIn(mail.text, '/reset/'))).toBeNull();
  });

  it('asks for 8 characters with a number', () => {
    expect(passwordProblem('short1')).not.toBeNull();
    expect(passwordProblem('longenough')).not.toBeNull();
    expect(passwordProblem('longenough1')).toBeNull();
  });
});

describe('invitations', () => {
  it('replaces an earlier invitation to the same email', async () => {
    const { org, user } = await makeEvent();
    const invitedBy = { id: user.id, name: 'Owner' };
    await sendInvitation({ organisationId: org.id, organisationName: org.name, email: 'new@example.com', role: 'EDITOR', invitedBy });
    await sendInvitation({ organisationId: org.id, organisationName: org.name, email: 'new@example.com', role: 'CHECKIN', invitedBy });
    const invites = await prisma.invitation.findMany({ where: { organisationId: org.id } });
    expect(invites).toHaveLength(1);
    expect(invites[0].role).toBe('CHECKIN');
    const mails = await prisma.outboundMessage.findMany({ where: { toAddress: 'new@example.com' }, orderBy: { createdAt: 'asc' } });
    expect(await findInvitation(linkIn(mails[0].text, '/invite/'))).toBeNull();
    expect((await findInvitation(linkIn(mails[1].text, '/invite/')))?.role).toBe('CHECKIN');
  });
});
