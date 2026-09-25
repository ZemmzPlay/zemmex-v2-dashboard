'use server';

import { randomInt } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@zemmz/db';
import { can, requirePermission } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { fullName } from '@/lib/format';
import { poolWhere } from '@/lib/raffle';

export interface DrawResult {
  error?: string;
  winner?: { name: string; publicId: number; detail: string; prize: string };
}

/** Picks one person at random, on the server, with a cryptographic generator. */
export async function drawWinner(slug: string, pool: string, excludeWinners: boolean, prize: string): Promise<DrawResult> {
  const { user, event } = await requirePermission(slug, can.editContent);
  const p = prize.trim().slice(0, 120);
  if (!p) return { error: 'Name the prize before drawing.' };
  if (pool !== 'all' && pool !== 'in') {
    const s = await prisma.session.findFirst({ where: { id: pool, eventId: event.id } });
    if (!s) return { error: 'Choose who to draw from.' };
  }
  const where = poolWhere(event.id, pool, excludeWinners);
  const n = await prisma.registration.count({ where });
  if (!n) return { error: 'Nobody is in this draw. Choose a different group.' };
  const [r] = await prisma.registration.findMany({ where, orderBy: { publicId: 'asc' }, skip: randomInt(n), take: 1 });
  if (!r) return { error: 'The draw changed while picking. Try again.' };
  await prisma.raffleDraw.create({ data: { eventId: event.id, registrationId: r.id, prize: p, drawnByLabel: user.name } });
  await logActivity(user, event.id, `drew ${fullName(r)} (ID ${r.publicId}) as the winner of ${p}, from ${n} ${n === 1 ? 'person' : 'people'}`);
  revalidatePath(`/events/${slug}/raffle`);
  return { winner: { name: fullName(r), publicId: r.publicId, detail: [r.field1, r.field2].filter(Boolean).join(' · '), prize: p } };
}
