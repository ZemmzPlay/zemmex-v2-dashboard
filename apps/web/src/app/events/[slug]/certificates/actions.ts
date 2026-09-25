'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@zemmz/db';
import { eventType } from '@zemmz/shared';
import { can, requirePermission } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { done, failed, type ActionState } from '@/lib/action-state';

const refresh = (slug: string) => {
  revalidatePath(`/events/${slug}`, 'layout');
  revalidatePath(`/e/${slug}`, 'layout');
};

const line = (label: string, max: number) => z.string().trim().max(max, `Keep the ${label} under ${max} characters`);

const templateSchema = z.object({
  title: z.string().trim().min(3, 'Give the certificate a title').max(120, 'Keep the title under 120 characters'),
  activityNumber: line('activity number', 60).default(''),
  provider: line('accrediting body', 160).default(''),
  bodyText: z.string().trim().min(10, 'Write the certificate text').max(800, 'Keep the certificate text under 800 characters'),
  signerName: line('name of the person signing', 120),
  signerRole: line('role', 120),
  issueDateText: line('date', 60),
});

export async function saveCertificateTemplate(slug: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, event } = await requirePermission(slug, can.editContent);
  const TY = eventType(event.type);
  if (TY.cert === 'none') return failed('This event has an after-event page instead of certificates.');
  const parsed = templateSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return failed(parsed.error.issues[0].message);
  const d = parsed.data;
  if (TY.credits && !d.bodyText.includes('{credits}')) return failed('The accreditation text needs {credits}, where each delegate’s points go.');
  const data = { ...d, activityNumber: TY.credits ? d.activityNumber : '', provider: TY.credits ? d.provider : '' };
  await prisma.certificateTemplate.upsert({ where: { eventId: event.id }, update: data, create: { eventId: event.id, ...data } });
  await logActivity(user, event.id, 'edited the certificate template');
  refresh(slug);
  return done('Certificate saved. New downloads use it straight away.');
}

const rulesSchema = z.object({
  creditRule: z.enum(['duration', 'checkin']).optional(),
  creditThresholdPct: z.coerce.number().int().min(1).max(100).optional(),
  minSessions: z.coerce.number().int().min(1).max(20).optional(),
  requireEvaluation: z.literal('on').optional(),
});

export async function saveCertificateRules(slug: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, event } = await requirePermission(slug, can.manageEvent);
  const TY = eventType(event.type);
  if (TY.cert === 'none') return failed('This event has an after-event page instead of certificates.');
  const parsed = rulesSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return failed('Check the rules and try again.');
  const d = parsed.data;
  await prisma.event.update({
    where: { id: event.id },
    data: {
      requireEvaluation: !!d.requireEvaluation,
      ...(TY.credits && d.creditRule ? { creditRule: d.creditRule, creditThresholdPct: d.creditThresholdPct ?? event.creditThresholdPct } : {}),
    },
  });
  // Medical: checking in to one session is always enough; points do the rest.
  if (!TY.credits && d.minSessions) {
    await prisma.certificateTemplate.update({ where: { eventId: event.id }, data: { minSessions: d.minSessions } }).catch(() => undefined);
  }
  await logActivity(user, event.id, TY.credits ? 'changed how CME points are earned' : 'changed who can claim a certificate');
  refresh(slug);
  return done(TY.credits ? 'Saved. Points not yet on a certificate are recalculated.' : 'Saved.');
}

const afterSchema = z.object({
  message: z.string().trim().max(1000, 'Keep the message under 1,000 characters'),
  attendeesOnly: z.enum(['1', '0']),
});

export async function saveAfterPage(slug: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, event } = await requirePermission(slug, can.editContent);
  const TY = eventType(event.type);
  const parsed = afterSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return failed(parsed.error.issues[0].message);
  const on = (k: string) => fd.get(k) === 'on';
  const data = {
    showRecordings: !TY.gates && on('showRecordings'),
    showSlides: !TY.gates && on('showSlides'),
    showPhotos: on('showPhotos'),
    showSurvey: on('showSurvey'),
    attendeesOnly: parsed.data.attendeesOnly === '1',
    message: parsed.data.message,
  };
  await prisma.afterEventPage.upsert({ where: { eventId: event.id }, update: data, create: { eventId: event.id, ...data } });
  await logActivity(user, event.id, `edited the ${TY.afterLbl.toLowerCase()}`);
  refresh(slug);
  return done('Saved. The website shows it when the page is switched on.');
}
