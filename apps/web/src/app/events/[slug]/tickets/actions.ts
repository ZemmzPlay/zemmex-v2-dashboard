'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@zemmz/db';
import { CURRENCIES, isCurrency } from '@zemmz/shared';
import { can, requirePermission } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { done, failed, type ActionState } from '@/lib/action-state';

const refresh = (slug: string) => {
  revalidatePath(`/events/${slug}`, 'layout');
  revalidatePath(`/e/${slug}`, 'layout');
};

const ticketSchema = z.object({
  name: z.string().trim().min(1, 'Name the ticket').max(80, 'Keep the name under 80 characters'),
  description: z.string().trim().max(200, 'Keep the description under 200 characters'),
  price: z.string().trim(),
  capacity: z.string().trim(),
});

export async function saveTicketType(slug: string, id: string | null, _p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, event } = await requirePermission(slug, can.manageEvent);
  const parsed = ticketSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return failed(parsed.error.issues[0].message);
  const d = parsed.data;

  const exp = isCurrency(event.currency) ? CURRENCIES[event.currency].exponent : 2;
  const price = d.price === '' ? 0 : Number(d.price);
  if (!Number.isFinite(price) || price < 0) return failed(`Enter a price in ${event.currency}, or 0 for free`);
  const priceMinor = Math.round(price * 10 ** exp);
  if (Math.abs(priceMinor - price * 10 ** exp) > 1e-6) return failed(`${event.currency} prices have at most ${exp} decimal places`);

  let capacity: number | null = null;
  if (d.capacity !== '') {
    capacity = Number(d.capacity);
    if (!Number.isInteger(capacity) || capacity < 1) return failed('Enter how many are available as a whole number, or leave it empty for no limit');
  }

  if (id) {
    const t = await prisma.ticketType.findFirst({ where: { id, eventId: event.id } });
    if (!t) return failed('That ticket type no longer exists. Reload the page.');
    const sold = await prisma.registration.count({ where: { ticketTypeId: id, status: 'CONFIRMED' } });
    if (capacity != null && capacity < sold) return failed(`${sold} are already sold, so there must be at least ${sold} available`);
    await prisma.ticketType.update({ where: { id }, data: { name: d.name, description: d.description, priceMinor, capacity } });
    await logActivity(user, event.id, `edited the ${d.name} ticket`);
  } else {
    const last = await prisma.ticketType.findFirst({ where: { eventId: event.id }, orderBy: { sortOrder: 'desc' } });
    await prisma.ticketType.create({ data: { eventId: event.id, name: d.name, description: d.description, priceMinor, capacity, onSale: true, sortOrder: (last?.sortOrder ?? -1) + 1 } });
    await logActivity(user, event.id, `added the ${d.name} ticket`);
  }
  refresh(slug);
  return done(id ? 'Ticket saved.' : `${d.name} is now on sale.`);
}

export async function setTicketOnSale(slug: string, id: string, onSale: boolean) {
  const { user, event } = await requirePermission(slug, can.manageEvent);
  const t = await prisma.ticketType.update({ where: { id, eventId: event.id }, data: { onSale } });
  await logActivity(user, event.id, `${onSale ? 'put' : 'took'} the ${t.name} ticket ${onSale ? 'on sale' : 'off sale'}`);
  refresh(slug);
}

export async function deleteTicketType(slug: string, fd: FormData) {
  const { user, event } = await requirePermission(slug, can.manageEvent);
  const id = String(fd.get('id') ?? '');
  const t = await prisma.ticketType.findFirst({ where: { id, eventId: event.id }, include: { _count: { select: { registrations: true, gates: true } } } });
  // Only unused types can go: registrations and gates point at them.
  if (!t || t._count.registrations || t._count.gates) return;
  await prisma.ticketType.delete({ where: { id } });
  await logActivity(user, event.id, `deleted the ${t.name} ticket`);
  refresh(slug);
}

const promoSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,20}$/, 'Use 3 to 20 letters, numbers or hyphens for the code'),
  percentOff: z.coerce.number({ invalid_type_error: 'Enter the discount as a percentage' }).int('Enter a whole percentage').min(1, 'The discount must be at least 1%').max(100, 'The discount can’t be more than 100%'),
  maxUses: z.string().trim(),
});

export async function createPromoCode(slug: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, event } = await requirePermission(slug, can.manageEvent);
  const parsed = promoSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return failed(parsed.error.issues[0].message);
  const d = parsed.data;
  let maxUses: number | null = null;
  if (d.maxUses !== '') {
    maxUses = Number(d.maxUses);
    if (!Number.isInteger(maxUses) || maxUses < 1) return failed('Enter how many times it can be used as a whole number, or leave it empty for no limit');
  }
  const exists = await prisma.promoCode.findUnique({ where: { eventId_code: { eventId: event.id, code: d.code } } });
  if (exists) return failed(`${d.code} already exists for this event. Choose another code.`);
  await prisma.promoCode.create({ data: { eventId: event.id, code: d.code, percentOff: d.percentOff, maxUses } });
  await logActivity(user, event.id, `created the promo code ${d.code} (${d.percentOff}% off)`);
  refresh(slug);
  return done(`${d.code} works at checkout now.`);
}

export async function setPromoActive(slug: string, id: string, active: boolean) {
  const { user, event } = await requirePermission(slug, can.manageEvent);
  const p = await prisma.promoCode.update({ where: { id, eventId: event.id }, data: { active } });
  await logActivity(user, event.id, `turned ${active ? 'on' : 'off'} the promo code ${p.code}`);
  refresh(slug);
}
