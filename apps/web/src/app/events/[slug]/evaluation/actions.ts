'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@zemmz/db';
import { evaluationTemplate, eventType } from '@zemmz/shared';
import { can, requirePermission } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { done, failed, type ActionState } from '@/lib/action-state';

const refresh = (slug: string) => revalidatePath(`/events/${slug}/evaluation`);

const questionSchema = z.object({
  text: z.string().trim().min(3, 'Write the question').max(300, 'Keep the question under 300 characters'),
  kind: z.enum(['RATING', 'CHECK', 'CHOICE', 'TEXT']),
  group: z.string().trim().max(120, 'Keep the heading under 120 characters').default(''),
  required: z.literal('on').optional(),
});

export async function saveQuestion(slug: string, id: string | null, _p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, event } = await requirePermission(slug, can.editContent);
  const TY = eventType(event.type);
  const parsed = questionSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return failed(parsed.error.issues[0].message);
  const d = parsed.data;
  if (d.kind === 'CHECK' && !d.group) return failed('Tick boxes need a heading, for example “This programme…”');
  // A tick box is never required: leaving it empty is an answer.
  const data = { text: d.text, kind: d.kind, groupName: d.kind === 'CHECK' ? d.group : '', required: d.kind !== 'CHECK' && !!d.required };

  if (id) {
    const q = await prisma.evaluationQuestion.findFirst({ where: { id, eventId: event.id }, include: { _count: { select: { answers: true } } } });
    if (!q) return failed('That question no longer exists. Reload the page.');
    if (q.kind !== d.kind && q._count.answers) return failed('This question already has answers, so its type can’t change. Add a new question instead.');
    await prisma.evaluationQuestion.update({ where: { id }, data });
    await logActivity(user, event.id, `edited a question on the ${TY.evalNav.toLowerCase()} form`);
  } else {
    const last = await prisma.evaluationQuestion.findFirst({ where: { eventId: event.id }, orderBy: { sortOrder: 'desc' } });
    await prisma.evaluationQuestion.create({ data: { eventId: event.id, ...data, sortOrder: (last?.sortOrder ?? -1) + 1 } });
    await logActivity(user, event.id, `added a question to the ${TY.evalNav.toLowerCase()} form`);
  }
  refresh(slug);
  return done('Saved.');
}

export async function moveQuestion(slug: string, id: string, by: -1 | 1) {
  const { event } = await requirePermission(slug, can.editContent);
  const qs = await prisma.evaluationQuestion.findMany({ where: { eventId: event.id }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true } });
  const i = qs.findIndex((q) => q.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= qs.length) return;
  [qs[i], qs[j]] = [qs[j], qs[i]];
  await prisma.$transaction(qs.map((q, n) => prisma.evaluationQuestion.update({ where: { id: q.id }, data: { sortOrder: n } })));
  refresh(slug);
}

export async function deleteQuestion(slug: string, fd: FormData) {
  const { user, event } = await requirePermission(slug, can.editContent);
  const TY = eventType(event.type);
  const q = await prisma.evaluationQuestion.findFirst({ where: { id: String(fd.get('id') ?? ''), eventId: event.id } });
  if (!q) return;
  await prisma.evaluationQuestion.delete({ where: { id: q.id } });
  await logActivity(user, event.id, `deleted the question “${q.text.slice(0, 60)}” from the ${TY.evalNav.toLowerCase()} form`);
  refresh(slug);
}

/** Replaces every question with the type's template. Only before anyone has answered. */
export async function resetToTemplate(slug: string) {
  const { user, event } = await requirePermission(slug, can.editContent);
  const TY = eventType(event.type);
  const responses = await prisma.evaluationResponse.count({ where: { eventId: event.id } });
  if (responses) return;
  await prisma.$transaction([
    prisma.evaluationQuestion.deleteMany({ where: { eventId: event.id } }),
    prisma.evaluationQuestion.createMany({
      data: evaluationTemplate(TY).map((q, i) => ({ eventId: event.id, text: q.text, kind: q.kind, groupName: q.group, required: q.required, sortOrder: i })),
    }),
  ]);
  await logActivity(user, event.id, `reset the ${TY.evalNav.toLowerCase()} form to the ${TY.credits ? 'KIMS' : 'standard'} template`);
  refresh(slug);
}
