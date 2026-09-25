'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { normaliseIban, validIban } from '@/lib/payouts';
import { paymentProvider, paymentsReady, PaymentError, startCheckout } from '@/lib/payments';
import { planQuote } from '@/lib/billing';
import { sign } from '@/lib/order-tokens';

import { prisma, type Role } from '@zemmz/db';
import { emailSchema } from '@zemmz/shared';
import { can, requireUser, ROLE_LABEL } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { platformEmail, queuePlatformEmail, sendInvitation } from '@/lib/accounts';
import { done, failed, type ActionState } from '@/lib/action-state';
import { redirect } from 'next/navigation';
import { appUrl } from '@/lib/email';
import { planDef } from '@/lib/plans';
import { hasTxt, newDomainToken, normaliseDomain, PUBLIC_EMAIL_DOMAINS } from '@/lib/domains';

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
  const elsewhere = await prisma.membership.count({ where: { userId: m.userId, organisationId: { not: user.organisationId } } });
  await prisma.$transaction([
    prisma.membership.delete({ where: { id: m.id } }),
    // Signed out straight away on every device, unless they still work for another organisation.
    ...(elsewhere ? [] : [prisma.authSession.deleteMany({ where: { userId: m.userId } })]),
  ]);
  await logActivity(user, null, `removed ${m.user.name} (${m.user.email})`);
  revalidatePath('/organisation');
}

const orgSchema = z.object({
  name: z.string().trim().min(2, 'Enter your organisation’s name').max(120),
  kind: z.string().trim().max(60).default(''),
  country: z.string().trim().max(60).default(''),
  legalName: z.string().trim().max(160).default(''),
  vatNumber: z.string().trim().max(30).regex(/^[A-Za-z0-9 -]*$/, 'VAT numbers have only letters, digits and spaces').default(''),
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

export async function requestActivation(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await manager();
  const plan = z.enum(['EVENT', 'SEASON', 'ENTERPRISE']).safeParse(fd.get('plan'));
  if (!plan.success) return failed('Choose a plan.');
  // An active plan stays as it is until the new one is paid for.
  await prisma.organisation.updateMany({ where: { id: user.organisationId, planStatus: { not: 'ACTIVE' } }, data: { plan: plan.data } });
  // The organisation ID in the message lets the admin page link the request to the account.
  await prisma.contactRequest.create({ data: { kind: 'UPGRADE', name: user.name, email: user.email, organisation: user.organisationName, plan: plan.data, message: `Activate ${plan.data} for organisation ${user.organisationId}` } });
  await queuePlatformEmail({ email: process.env.SALES_EMAIL || 'hello@zemmz.com' }, `Plan request: ${user.organisationName}`, platformEmail({
    heading: `${user.organisationName} wants the ${plan.data.toLowerCase()} plan`,
    paragraphs: [`${user.name} (${user.email}) asked to activate the plan. Send the invoice, then activate it in /admin.`],
  }));
  await logActivity(user, null, `asked to activate the ${plan.data.toLowerCase()} plan`);
  revalidatePath('/organisation');
  return done('Thanks. We’ll email the invoice within one working day.');
}

export async function savePayoutAccount(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await manager();
  const g = (k: string) => String(fd.get(k) ?? '').trim();
  const iban = normaliseIban(g('iban'));
  if (!g('accountName')) return failed('Enter the name on the bank account');
  if (!g('bankName')) return failed('Enter the bank’s name');
  if (!validIban(iban)) return failed('That IBAN doesn’t check out. Copy it from a bank statement, for example AE07 0331 2345 6789 0123 456');
  const swift = g('swift').toUpperCase();
  if (swift && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(swift)) return failed('A SWIFT code has 8 or 11 letters and digits, for example EBILAEAD');
  await prisma.organisation.update({ where: { id: user.organisationId }, data: { payoutAccountName: g('accountName').slice(0, 120), payoutBankName: g('bankName').slice(0, 120), payoutIban: iban, payoutSwift: swift } });
  await logActivity(user, null, `changed the payout bank account to one ending ${iban.slice(-4)}`);
  revalidatePath('/organisation');
  return done('Bank details saved. Payouts go to this account from now on.');
}

/** Pay for a plan (or one more event) by card, on the provider's page. */
export async function buyPlan(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await manager();
  const plan = z.enum(['EVENT', 'SEASON']).safeParse(fd.get('plan'));
  if (!plan.success) return failed('Choose a plan.');
  if (!paymentsReady()) return failed('Card payments aren’t set up yet. Ask for an invoice instead.');
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: user.organisationId } });
  const q = planQuote(plan.data, org.country)!;
  const purchase = await prisma.planPurchase.create({
    data: { organisationId: org.id, plan: plan.data, currency: q.currency, amountMinor: q.amountMinor, vatMinor: q.vatMinor, totalMinor: q.totalMinor, provider: paymentProvider(), byLabel: user.name },
  });
  const token = sign('plan', purchase.id);
  let url: string;
  try {
    const base = `${appUrl()}/organisation/billing`;
    const c = await startCheckout({
      orderId: purchase.id, amountMinor: q.totalMinor, currency: q.currency, locale: 'en',
      description: `zemmz Live: ${planDef(plan.data).name} plan`,
      buyer: { name: user.name, email: user.email },
      returnUrl: `${base}/return?p=${token}&s={SESSION}`,
      cancelUrl: `${base}/cancel?p=${token}`,
      webhookUrl: `${appUrl()}/api/payments/${paymentProvider()}`,
      mockUrl: `/organisation/billing/test/${token}`,
    });
    await prisma.planPurchase.update({ where: { id: purchase.id }, data: { providerSession: c.session } });
    url = c.url;
  } catch (e) {
    await prisma.planPurchase.update({ where: { id: purchase.id }, data: { status: 'FAILED' } });
    return failed(`${e instanceof PaymentError ? e.message : 'The payment provider could not be reached.'} Nothing was charged.`);
  }
  redirect(url);
}

/* ------------------------------------------------------------------ */
/* Single sign-on (enterprise)                                          */
/* ------------------------------------------------------------------ */

async function enterprise() {
  const user = await manager();
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: user.organisationId } });
  return { user, org, allowed: org.plan === 'ENTERPRISE' && org.planStatus === 'ACTIVE' };
}

export async function setSsoDomain(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, org, allowed } = await enterprise();
  if (!allowed) return failed('Single sign-on comes with the government and enterprise plan.');
  const domain = normaliseDomain(String(fd.get('domain') ?? ''));
  if (!domain) return failed('Enter your email domain, for example health.gov.ae');
  if (PUBLIC_EMAIL_DOMAINS.has(domain)) return failed(`${domain} is a public email service, so it can’t be claimed. Use your organisation’s own domain.`);
  if (!user.email.endsWith(`@${domain}`)) return failed(`Use the domain of your own email address (${user.email.split('@')[1]}), so we know it’s yours.`);
  const taken = await prisma.organisation.findFirst({ where: { ssoDomain: domain, id: { not: org.id } } });
  if (taken) return failed(`${domain} is already set up by another organisation. Contact us if that’s wrong.`);
  await prisma.organisation.update({ where: { id: org.id }, data: { ssoDomain: domain, ssoDomainToken: newDomainToken(), ssoDomainVerifiedAt: null, ssoRequired: false } });
  await logActivity(user, null, `started single sign-on for ${domain}`);
  revalidatePath('/organisation');
  return done('Now add the DNS record below, then check it.');
}

export async function verifySsoDomain(_p: ActionState, _fd: FormData): Promise<ActionState> {
  const { user, org } = await enterprise();
  if (!org.ssoDomain) return failed('Add your email domain first.');
  if (!(await hasTxt(org.ssoDomain, org.ssoDomainToken))) return failed(`We couldn’t find the TXT record on ${org.ssoDomain} yet. DNS changes can take up to an hour; check the value matches exactly.`);
  await prisma.organisation.update({ where: { id: org.id }, data: { ssoDomainVerifiedAt: new Date() } });
  await logActivity(user, null, `verified ${org.ssoDomain} for single sign-on`);
  revalidatePath('/organisation');
  return done(`${org.ssoDomain} is verified. People with an @${org.ssoDomain} Microsoft or Google account now join when they first sign in.`);
}

export async function saveSsoSettings(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, org } = await enterprise();
  if (!org.ssoDomainVerifiedAt) return failed('Verify your domain first.');
  const role = z.enum(['ADMIN', 'EDITOR', 'CHECKIN']).safeParse(fd.get('role'));
  if (!role.success) return failed('Choose the role new people get.');
  const required = fd.get('required') === 'on';
  if (required && !user.email.endsWith(`@${org.ssoDomain}`)) return failed('Only someone with an address at the domain can require single sign-on.');
  if (required) {
    const me = await prisma.userIdentity.count({ where: { userId: user.id, provider: { in: ['microsoft', 'google', 'test'] } } });
    if (!me) return failed('Connect Microsoft or Google under Your account first, so requiring it doesn’t lock you out.');
  }
  await prisma.organisation.update({ where: { id: org.id }, data: { ssoDefaultRole: role.data, ssoRequired: required } });
  await logActivity(user, null, `set single sign-on: new people join as ${ROLE_LABEL[role.data].toLowerCase()}${required ? ', passwords turned off' : ''}`);
  revalidatePath('/organisation');
  return done('Saved.');
}

export async function removeSsoDomain() {
  const { user, org } = await enterprise();
  await prisma.organisation.update({ where: { id: org.id }, data: { ssoDomain: null, ssoDomainToken: '', ssoDomainVerifiedAt: null, ssoRequired: false } });
  await logActivity(user, null, `turned off single sign-on for ${org.ssoDomain}`);
  revalidatePath('/organisation');
}
