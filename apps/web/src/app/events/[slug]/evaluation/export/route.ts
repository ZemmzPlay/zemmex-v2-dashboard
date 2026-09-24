import { prisma } from '@zemmz/db';
import { eventType } from '@zemmz/shared';
import { can, requirePermission } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { csvLine } from '@/lib/csv';

/** Every response, one row each, one column per question. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, event } = await requirePermission(slug, can.editRegistrations);
  const TY = eventType(event.type);
  const [questions, responses] = await Promise.all([
    prisma.evaluationQuestion.findMany({ where: { eventId: event.id }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
    prisma.evaluationResponse.findMany({ where: { eventId: event.id }, orderBy: { submittedAt: 'asc' }, include: { answers: true, registration: { select: { publicId: true, firstName: true, lastName: true } } } }),
  ]);
  const lines = [csvLine([TY.idName, 'First name', 'Last name', 'Submitted (UTC)', ...questions.map((q) => (q.groupName ? `${q.groupName} ${q.text}` : q.text))])];
  for (const r of responses) {
    const by = new Map(r.answers.map((a) => [a.questionId, a]));
    lines.push(csvLine([
      r.registration.publicId, r.registration.firstName, r.registration.lastName, r.submittedAt.toISOString(),
      ...questions.map((q) => {
        const a = by.get(q.id);
        if (!a) return '';
        return q.kind === 'CHECK' ? (a.checked ? 'Yes' : '') : q.kind === 'TEXT' ? a.text ?? '' : a.rating ?? '';
      }),
    ]));
  }
  await logActivity(user, event.id, `exported ${responses.length} ${TY.evalNav.toLowerCase()} responses`);
  return new Response('﻿' + lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${event.slug}-${TY.evalNav.toLowerCase()}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
