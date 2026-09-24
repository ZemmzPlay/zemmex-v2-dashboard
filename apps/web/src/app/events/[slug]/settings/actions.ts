'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@zemmz/db';
import { can, requirePermission } from '@/lib/auth';
import { logActivity } from '@/lib/activity';

export interface SettingsState {
  ok?: string;
  error?: string;
}

const detailsSchema = z.object({
  name: z.string().trim().min(3, 'Give the event a name').max(120),
  shortName: z.string().trim().min(1, 'Add a short name, up to 4 letters').max(4, 'Keep the short name to 4 letters'),
  organiserName: z.string().trim().max(120),
});

export async function saveDetails(slug: string, _p: SettingsState, fd: FormData): Promise<SettingsState> {
  const { user, event } = await requirePermission(slug, can.manageEvent);
  const parsed = detailsSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  await prisma.event.update({
    where: { id: event.id },
    data: { name: d.name, shortName: d.shortName.toUpperCase(), organiserName: d.organiserName },
  });
  await logActivity(user, event.id, 'edited the event details');
  revalidatePath(`/events/${slug}`, 'layout');
  revalidatePath(`/e/${slug}`, 'layout');
  return { ok: 'Saved.' };
}
