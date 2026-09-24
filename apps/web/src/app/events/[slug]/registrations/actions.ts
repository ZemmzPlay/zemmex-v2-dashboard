'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@zemmz/db';
import { emailSchema, eventType, mobileSchema } from '@zemmz/shared';
import { can, requirePermission } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { createRegistrations, RegistrationError, resendConfirmation, validateAgainstForm, type PersonInput } from '@/lib/registrations';

export interface FormState {
  ok?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
}

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

/** Reads the person fields from a form built from the event's FormField rows. */
async function readPerson(eventId: string, fd: FormData) {
  const fields = await prisma.formField.findMany({ where: { eventId }, orderBy: { sortOrder: 'asc' } });
  const answers: Record<string, string> = {};
  for (const f of fields) if (!['title', 'first', 'last', 'email', 'mob', 'spec', 'hosp', 'tk'].includes(f.key)) answers[f.key] = s(fd, `a_${f.key}`);
  const p: PersonInput = {
    ticketTypeId: s(fd, 'ticketTypeId') || null,
    title: s(fd, 'title'),
    firstName: s(fd, 'firstName'),
    lastName: s(fd, 'lastName'),
    email: s(fd, 'email'),
    mobile: s(fd, 'mobile'),
    field1: s(fd, 'field1'),
    field2: s(fd, 'field2'),
    answers,
  };
  const errors: Record<string, string> = {};
  if (!p.firstName) errors.first = 'Enter a first name';
  if (!p.lastName) errors.last = 'Enter a last name';
  const em = emailSchema.safeParse(p.email);
  if (!em.success) errors.email = em.error.issues[0].message;
  else p.email = em.data;
  const mob = mobileSchema.safeParse(p.mobile);
  if (!mob.success) errors.mob = mob.error.issues[0].message;
  else p.mobile = mob.data;
  // Organisers may leave optional profile fields empty; only check formats and options.
  const formErrors = validateAgainstForm(fields.map((f) => ({ ...f, required: f.locked && f.required })), p);
  return { p, errors: { ...formErrors, ...errors }, values: Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)])) };
}

export async function addRegistration(slug: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { user, event } = await requirePermission(slug, can.editRegistrations);
  const { p, errors, values } = await readPerson(event.id, fd);
  if (Object.keys(errors).length) return { fieldErrors: errors, values, error: 'Check the highlighted fields.' };
  let publicId: number;
  try {
    const [reg] = await createRegistrations({ event, people: [p], source: 'DASHBOARD', bypassSales: true });
    publicId = reg.publicId;
  } catch (e) {
    if (e instanceof RegistrationError) return { error: e.message, values };
    throw e;
  }
  await logActivity(user, event.id, `added ${p.firstName} ${p.lastName} (ID ${publicId})`);
  revalidatePath(`/events/${slug}`, 'layout');
  redirect(`/events/${slug}/registrations/${publicId}?added=1`);
}

export async function updateRegistration(slug: string, publicId: number, _prev: FormState, fd: FormData): Promise<FormState> {
  const { user, event } = await requirePermission(slug, can.editRegistrations);
  const { p, errors, values } = await readPerson(event.id, fd);
  if (Object.keys(errors).length) return { fieldErrors: errors, values, error: 'Check the highlighted fields.' };
  const reg = await prisma.registration.findUniqueOrThrow({ where: { eventId_publicId: { eventId: event.id, publicId } } });
  if (p.ticketTypeId) {
    const ok = await prisma.ticketType.count({ where: { id: p.ticketTypeId, eventId: event.id } });
    if (!ok) return { error: 'That ticket type doesn’t belong to this event.', values };
  }
  await prisma.registration.update({
    where: { id: reg.id },
    data: { title: p.title, firstName: p.firstName, lastName: p.lastName, email: p.email, mobile: p.mobile, field1: p.field1, field2: p.field2, answers: p.answers, ticketTypeId: p.ticketTypeId ?? reg.ticketTypeId },
  });
  await logActivity(user, event.id, `edited ${p.firstName} ${p.lastName} (ID ${publicId})`);
  revalidatePath(`/events/${slug}/registrations`, 'layout');
  return { ok: 'Changes saved.' };
}

export async function resend(slug: string, publicId: number) {
  const { user, event } = await requirePermission(slug, can.editRegistrations);
  const reg = await prisma.registration.findUniqueOrThrow({ where: { eventId_publicId: { eventId: event.id, publicId } } });
  await resendConfirmation(event, reg.id);
  await logActivity(user, event.id, `resent the confirmation email to ${reg.email}`);
  redirect(`/events/${slug}/registrations/${publicId}?resent=1`);
}

export async function cancelRegistration(slug: string, publicId: number) {
  const { user, event } = await requirePermission(slug, can.editRegistrations);
  const TY = eventType(event.type);
  const reg = await prisma.registration.update({ where: { eventId_publicId: { eventId: event.id, publicId } }, data: { status: 'CANCELLED' } });
  await logActivity(user, event.id, `cancelled ${TY.one} ${publicId} (${reg.firstName} ${reg.lastName})`);
  revalidatePath(`/events/${slug}`, 'layout');
  redirect(`/events/${slug}/registrations/${publicId}`);
}

export async function restoreRegistration(slug: string, publicId: number) {
  const { user, event } = await requirePermission(slug, can.editRegistrations);
  const TY = eventType(event.type);
  await prisma.registration.update({ where: { eventId_publicId: { eventId: event.id, publicId } }, data: { status: 'CONFIRMED' } });
  await logActivity(user, event.id, `restored ${TY.one} ${publicId}`);
  revalidatePath(`/events/${slug}`, 'layout');
  redirect(`/events/${slug}/registrations/${publicId}`);
}

export async function markPrinted(slug: string, publicId: number) {
  const { event } = await requirePermission(slug, can.checkIn);
  await prisma.registration.updateMany({ where: { eventId: event.id, publicId, badgePrintedAt: null }, data: { badgePrintedAt: new Date() } });
}
