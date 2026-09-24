'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@zemmz/db';
import { eventType } from '@zemmz/shared';
import { can, requirePermission } from '@/lib/auth';
import { logActivity } from '@/lib/activity';

export type QuickKey = 'registrationOpen' | 'afterEventOn' | 'maintenance';

export async function setQuickSetting(slug: string, key: QuickKey, value: boolean) {
  const { user, event } = await requirePermission(slug, can.manageEvent);
  if (!['registrationOpen', 'afterEventOn', 'maintenance'].includes(key)) throw new Error('Unknown setting');
  await prisma.event.update({ where: { id: event.id }, data: { [key]: value } });
  const t = eventType(event.type);
  const what = key === 'registrationOpen' ? t.openLbl.toLowerCase() : key === 'afterEventOn' ? `the ${t.afterLbl.toLowerCase()}` : 'the maintenance page';
  await logActivity(user, event.id, `turned ${value ? 'on' : 'off'} ${what}`);
  revalidatePath(`/events/${slug}`);
  revalidatePath(`/e/${slug}`);
}
