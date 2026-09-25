'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@zemmz/db';
import { dayKey, eventType, sessionStatusAt, shortTitle, zonedTime, mergeArabic } from '@zemmz/shared';
import { can, requirePermission } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { done, failed, type ActionState } from '@/lib/action-state';

const sessionSchema = z.object({
  title: z.string().trim().min(1, 'Give it a title').max(160, 'Keep the title under 160 characters'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the day'),
  starts: z.string().regex(/^\d{2}:\d{2}$/, 'Enter the start time'),
  ends: z.string().regex(/^\d{2}:\d{2}$/, 'Enter the end time'),
  chairs: z.string().trim().max(200).default(''),
  location: z.string().trim().max(120).default(''),
  credits: z.string().trim().default(''),
  capacity: z.string().trim().default(''),
  gateTicketTypeId: z.string().default(''),
});

export async function saveSession(slug: string, id: string | null, _p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, event } = await requirePermission(slug, can.editContent);
  const TY = eventType(event.type);
  const parsed = sessionSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return failed(parsed.error.issues[0].message);
  const d = parsed.data;

  const first = dayKey(event.startsOn, 'UTC');
  const last = dayKey(event.endsOn, 'UTC');
  if (d.date < first || d.date > last) return failed(`Choose a day between the event’s first and last day`);
  const startsAt = zonedTime(d.date, d.starts, event.timezone);
  let endsAt = zonedTime(d.date, d.ends, event.timezone);
  if (endsAt <= startsAt) {
    // A gate can close after midnight; a session can't end before it starts.
    if (!TY.gates) return failed('The end time must be after the start time');
    endsAt = new Date(endsAt.getTime() + 86_400_000);
  }

  let credits = 0;
  if (TY.credits && d.credits) {
    credits = Number(d.credits);
    if (!Number.isFinite(credits) || credits < 0 || credits > 50 || Math.round(credits * 4) !== credits * 4) return failed('Enter CME points in quarter points, like 1.5, or 0');
  }
  let capacity: number | null = null;
  if (d.capacity) {
    capacity = Number(d.capacity);
    if (!Number.isInteger(capacity) || capacity < 1) return failed('Enter the capacity as a whole number, or leave it empty for no limit');
  }
  let gateTicketTypeId: string | null = null;
  if (TY.gates && d.gateTicketTypeId) {
    const t = await prisma.ticketType.findFirst({ where: { id: d.gateTicketTypeId, eventId: event.id } });
    if (!t) return failed('Choose a ticket type from this event');
    gateTicketTypeId = t.id;
  }

  const data = {
    title: d.title, startsAt, endsAt, chairs: d.chairs, location: TY.gates ? '' : d.location, credits, capacity, gateTicketTypeId,
    kind: TY.gates ? ('GATE' as const) : ('SESSION' as const),
    status: sessionStatusAt({ startsAt, endsAt }, new Date()).toUpperCase() as 'UPCOMING' | 'LIVE' | 'ENDED',
  };
  if (id) {
    const s = await prisma.session.findFirst({ where: { id, eventId: event.id }, include: { _count: { select: { attendance: true } } } });
    if (!s) return failed('That no longer exists. Reload the page.');
    await prisma.session.update({ where: { id }, data: { ...data, ar: mergeArabic(s.ar, fd, TY.gates ? ['title'] : ['title', 'chairs', 'location'], 200) } });
    await logActivity(user, event.id, `edited ${shortTitle(d.title)}`);
  } else {
    await prisma.session.create({ data: { eventId: event.id, ...data, ar: mergeArabic({}, fd, TY.gates ? ['title'] : ['title', 'chairs', 'location'], 200) } });
    await logActivity(user, event.id, `added ${shortTitle(d.title)} to the ${TY.gates ? 'gates' : 'programme'}`);
  }
  revalidatePath(`/events/${slug}`, 'layout');
  revalidatePath(`/e/${slug}`, 'layout');
  return done(id ? 'Saved.' : 'Added to the schedule and the website.');
}

export async function deleteSession(slug: string, fd: FormData) {
  const { user, event } = await requirePermission(slug, can.editContent);
  const s = await prisma.session.findFirst({ where: { id: String(fd.get('id') ?? ''), eventId: event.id }, include: { _count: { select: { attendance: true } } } });
  // Scans are the record of attendance: certificates and points depend on them.
  if (!s || s._count.attendance) return;
  await prisma.session.delete({ where: { id: s.id } });
  await logActivity(user, event.id, `deleted ${shortTitle(s.title)}`);
  revalidatePath(`/events/${slug}`, 'layout');
  revalidatePath(`/e/${slug}`, 'layout');
}
