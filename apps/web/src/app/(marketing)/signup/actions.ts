'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { hashPassword, prisma } from '@zemmz/db';
import { emailSchema } from '@zemmz/shared';
import { createSession, getSessionAccount } from '@/lib/auth';
import { CODE_MINUTES, passwordProblem, platformEmail, queuePlatformEmail, sha256, sixDigits } from '@/lib/accounts';
import { rateLimit } from '@/lib/rate-limit';

export interface SignupState {
  error?: string;
  ok?: string;
  fields?: Record<string, string>;
  values?: Record<string, string>;
}

/** Keeps the plan picked on the pricing section through the first steps. */
const withPlan = (fd: FormData) => {
  const p = String(fd.get('plan') ?? '').toLowerCase();
  return ['event', 'season', 'enterprise'].includes(p) ? `/signup?plan=${p}` : '/signup';
};

const ip = async () => (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';

async function sendCode(user: { id: string; email: string; name: string }) {
  const code = sixDigits();
  await prisma.emailCode.create({ data: { userId: user.id, codeHash: sha256(`${user.id}:${code}`), expiresAt: new Date(Date.now() + CODE_MINUTES * 60_000) } });
  await queuePlatformEmail(user, `${code} is your zemmz Live code`, platformEmail({
    heading: 'Confirm your email',
    paragraphs: [`Hi ${user.name.split(' ')[0]},`, `Enter this code to finish creating your zemmz Live account. It works for ${CODE_MINUTES} minutes.`],
    code,
    footer: 'If you didn’t try to create an account, ignore this email.',
  }));
}

/** Step 1: the account. The email must be proved before anything else is created. */
export async function createAccount(_p: SignupState, fd: FormData): Promise<SignupState> {
  const values = { name: String(fd.get('name') ?? ''), email: String(fd.get('email') ?? '') };
  const fields: Record<string, string> = {};
  const name = values.name.trim();
  if (name.length < 2) fields.name = 'Enter your name.';
  const email = emailSchema.safeParse(values.email);
  if (!email.success) fields.email = 'Enter a valid email address.';
  const pw = String(fd.get('password') ?? '');
  const bad = passwordProblem(pw);
  if (bad) fields.password = bad;
  if (Object.keys(fields).length) return { fields, values };
  if (!rateLimit(`signup:${await ip()}`, 8, 60 * 60_000)) return { error: 'Too many sign-ups from here. Try again in an hour, or email hello@zemmz.com.', values };

  const existing = await prisma.user.findUnique({ where: { email: email.data! } });
  if (existing) return { error: 'There’s already an account with this email. Sign in instead, or reset the password if you’ve forgotten it.', values };
  const user = await prisma.user.create({ data: { name: name.slice(0, 120), email: email.data!, passwordHash: await hashPassword(pw) } });
  await sendCode(user);
  await createSession(user.id);
  redirect(withPlan(fd));
}

export async function verifyCode(_p: SignupState, fd: FormData): Promise<SignupState> {
  const user = await getSessionAccount();
  if (!user) redirect('/signup');
  const code = String(fd.get('code') ?? '').replace(/\D/g, '');
  if (code.length !== 6) return { error: 'Enter all 6 digits.' };
  const latest = await prisma.emailCode.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
  if (!latest || latest.expiresAt < new Date()) return { error: 'That code has expired. Send a new one.' };
  if (latest.attempts >= 5) return { error: 'Too many wrong codes. Send a new one.' };
  if (latest.codeHash !== sha256(`${user.id}:${code}`)) {
    await prisma.emailCode.update({ where: { id: latest.id }, data: { attempts: { increment: 1 } } });
    return { error: 'That code isn’t right. Check the latest email and try again.' };
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } }),
    prisma.emailCode.deleteMany({ where: { userId: user.id } }),
  ]);
  redirect(withPlan(fd));
}

export async function resendCode(): Promise<SignupState> {
  const user = await getSessionAccount();
  if (!user || user.emailVerifiedAt) return {};
  if (!rateLimit(`code:${user.id}`, 4, 30 * 60_000)) return { error: 'We’ve sent several codes. Wait a few minutes, and check your spam folder.' };
  await sendCode(user);
  return { ok: `New code sent to ${user.email}.` };
}

const orgSchema = z.object({
  org: z.string().trim().min(2, 'Enter your organisation’s name.').max(120),
  kind: z.string().trim().min(1, 'Choose one.').max(60),
  country: z.string().trim().max(60).default(''),
  plan: z.enum(['EVENT', 'SEASON', 'ENTERPRISE']).default('EVENT'),
});

/** Step 3: the organisation, with the new account as its owner, on the free trial. */
export async function createOrganisation(_p: SignupState, fd: FormData): Promise<SignupState> {
  const user = await getSessionAccount();
  if (!user) redirect('/signup');
  if (!user.emailVerifiedAt) redirect('/signup');
  if (user.memberships.length) redirect('/signup/event');
  const values = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
  const parsed = orgSchema.safeParse(values);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) fields[String(i.path[0])] ??= i.message;
    return { fields, values };
  }
  const d = parsed.data;
  const stem = d.org.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'organisation';
  let slug = stem;
  for (let n = 2; await prisma.organisation.findUnique({ where: { slug } }); n++) slug = `${stem}-${n}`;
  await prisma.organisation.create({
    data: {
      name: d.org, slug, kind: d.kind, country: d.country, plan: d.plan, planStatus: 'TRIAL',
      memberships: { create: { userId: user.id, role: 'OWNER' } },
      activity: { create: { actorId: user.id, actorLabel: user.name, action: `created the organisation ${d.org}` } },
    },
  });
  redirect('/signup/event');
}
