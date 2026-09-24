'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { prisma } from '@zemmz/db';
import { emailSchema } from '@zemmz/shared';
import { platformEmail, queuePlatformEmail } from '@/lib/accounts';
import { rateLimit } from '@/lib/rate-limit';

export interface ContactState {
  ok?: string;
  error?: string;
  values?: Record<string, string>;
}

const salesInbox = () => process.env.SALES_EMAIL || 'hello@zemmz.com';
const ip = async () => (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';

async function notifySales(kind: string, fields: [string, string][]) {
  await queuePlatformEmail({ email: salesInbox(), name: 'zemmz sales' }, `New ${kind} request`, platformEmail({
    heading: `New ${kind} request`,
    paragraphs: fields.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`),
    footer: 'Sent by the zemmz Live website. Mark it handled in /admin.',
  }));
}

/** The footer's one-field demo request. A hidden field catches bots. */
export async function requestDemo(_p: ContactState, fd: FormData): Promise<ContactState> {
  if (fd.get('website')) return { ok: 'Thanks. We’ll be in touch within one working day.' };
  const email = emailSchema.safeParse(fd.get('email'));
  if (!email.success) return { error: 'Enter a valid email address.', values: { email: String(fd.get('email') ?? '') } };
  if (!rateLimit(`contact:${await ip()}`, 5, 60 * 60_000)) return { error: 'We’ve had several requests from here. Email hello@zemmz.com instead.' };
  await prisma.contactRequest.create({ data: { kind: 'DEMO', email: email.data } });
  await notifySales('demo', [['Email', email.data]]);
  return { ok: 'Thanks. We’ll email you within one working day to find a time.' };
}

const contactSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name.').max(120),
  email: emailSchema,
  organisation: z.string().trim().max(160).default(''),
  message: z.string().trim().max(3000, 'Keep the message under 3,000 characters.').default(''),
  about: z.enum(['demo', 'contact', 'enterprise']).default('contact'),
});

export async function sendContact(_p: ContactState, fd: FormData): Promise<ContactState> {
  const values = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
  if (fd.get('website')) return { ok: 'Thanks. We’ll reply within one working day.' };
  const parsed = contactSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message.replace('Enter an email address like', 'Enter a valid email, like'), values };
  if (!rateLimit(`contact:${await ip()}`, 5, 60 * 60_000)) return { error: 'We’ve had several messages from here. Email hello@zemmz.com instead.', values };
  const d = parsed.data;
  const kind = d.about === 'demo' ? 'DEMO' : d.about === 'enterprise' ? 'UPGRADE' : 'CONTACT';
  await prisma.contactRequest.create({ data: { kind, name: d.name, email: d.email, organisation: d.organisation, message: d.message, plan: d.about === 'enterprise' ? 'ENTERPRISE' : null } });
  await notifySales(d.about === 'enterprise' ? 'enterprise plan' : d.about, [['Name', d.name], ['Email', d.email], ['Organisation', d.organisation], ['Message', d.message]]);
  return { ok: `Thanks, ${d.name.split(' ')[0]}. We’ll reply to ${d.email} within one working day.` };
}
