'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@zemmz/db';
import { eventType } from '@zemmz/shared';
import { can, requirePermission } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { done, failed, type ActionState } from '@/lib/action-state';

const personSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(120, 'Keep the name under 120 characters'),
  category: z.string().trim(),
  bio: z.string().trim().max(4000, 'Keep the biography under 4,000 characters'),
  highlight: z.string().trim(),
  setTime: z.string().trim().max(40, 'Keep the set time short, like 21:30–22:15').optional(),
  sortOrder: z.coerce.number({ invalid_type_error: 'Enter the display order as a number' }).int('Enter the display order as a whole number').min(1, 'The display order starts at 1').max(9999).optional(),
});

export async function savePerson(slug: string, id: string | null, _p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, event } = await requirePermission(slug, can.editContent);
  const TY = eventType(event.type);
  const raw = Object.fromEntries(fd.entries());
  if (raw.sortOrder === '') delete raw.sortOrder;
  const parsed = personSchema.safeParse(raw);
  if (!parsed.success) return failed(parsed.error.issues[0].message);
  const d = parsed.data;
  if (!TY.cats.includes(d.category)) return failed('Choose a category');
  if (d.highlight && !TY.highlights.some(([k]) => k === d.highlight)) return failed('Choose how they appear on the homepage');

  const data = { name: d.name, category: d.category, bio: d.bio, highlight: d.highlight, setTime: TY.gates ? d.setTime ?? '' : '', ...(d.sortOrder ? { sortOrder: d.sortOrder } : {}) };
  if (id) {
    const p = await prisma.person.findFirst({ where: { id, eventId: event.id } });
    if (!p) return failed(`That ${TY.person} no longer exists. Reload the page.`);
    await prisma.person.update({ where: { id }, data });
    await logActivity(user, event.id, `edited ${d.name} on the ${TY.people} page`);
  } else {
    const last = await prisma.person.findFirst({ where: { eventId: event.id }, orderBy: { sortOrder: 'desc' } });
    await prisma.person.create({ data: { eventId: event.id, ...data, sortOrder: d.sortOrder ?? (last?.sortOrder ?? 0) + 1 } });
    await logActivity(user, event.id, `added ${d.name} to the ${TY.people} page`);
  }
  revalidatePath(`/events/${slug}/people`);
  revalidatePath(`/e/${slug}`, 'layout');
  return done(id ? `${d.name} updated on the website.` : `${d.name} added to the ${TY.people} page.`);
}

export async function deletePerson(slug: string, fd: FormData) {
  const { user, event } = await requirePermission(slug, can.editContent);
  const TY = eventType(event.type);
  const p = await prisma.person.findFirst({ where: { id: String(fd.get('id') ?? ''), eventId: event.id } });
  if (!p) return;
  await prisma.person.delete({ where: { id: p.id } });
  await logActivity(user, event.id, `removed ${p.name} from the ${TY.people} page`);
  revalidatePath(`/events/${slug}/people`);
  revalidatePath(`/e/${slug}`, 'layout');
}
