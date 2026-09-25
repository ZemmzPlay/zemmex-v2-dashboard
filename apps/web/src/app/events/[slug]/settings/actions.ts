'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@zemmz/db';
import { eventType } from '@zemmz/shared';
import { can, requirePermission, requireUser } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { done, failed, type ActionState } from '@/lib/action-state';
import { domainTarget, hasTxt, newDomainToken, normaliseDomain, pointsHere } from '@/lib/domains';

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

const whenSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the first day'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the last day'),
  timezone: z.string().refine((tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } }, 'Choose a timezone'),
  currency: z.enum(['AED', 'KWD', 'SAR', 'QAR', 'BHD', 'OMR']).optional(),
});

export async function saveWhen(slug: string, _p: SettingsState, fd: FormData): Promise<SettingsState> {
  const { user, event } = await requirePermission(slug, can.manageEvent);
  const parsed = whenSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (d.endDate < d.startDate) return { error: 'The last day must be on or after the first day.' };
  const startsOn = new Date(`${d.startDate}T00:00:00Z`);
  const endsOn = new Date(`${d.endDate}T00:00:00Z`);
  // Times are stored as instants, so a new timezone would move every session; only allow it before there are any.
  const sessions = await prisma.session.findMany({ where: { eventId: event.id }, select: { startsAt: true } });
  if (d.timezone !== event.timezone && sessions.length) return { error: 'The timezone can’t change once the schedule has sessions, because every time would move. Delete the sessions first, or keep the timezone.' };
  const tzDay = (t: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: d.timezone }).format(t);
  const outside = sessions.filter((s) => tzDay(s.startsAt) < d.startDate || tzDay(s.startsAt) > d.endDate).length;
  if (outside) return { error: `${outside} scheduled ${outside === 1 ? 'item falls' : 'items fall'} outside these dates. Move ${outside === 1 ? 'it' : 'them'} first.` };
  let currency = event.currency;
  if (d.currency && d.currency !== event.currency) {
    const orders = await prisma.order.count({ where: { eventId: event.id } });
    if (orders) return { error: 'The currency can’t change after the first order.' };
    currency = d.currency;
  }
  const gates = eventType(event.type).gates;
  await prisma.event.update({ where: { id: event.id }, data: { startsOn, endsOn, timezone: d.timezone, currency, ...(gates ? { allowPassOut: fd.get('allowPassOut') === 'on' } : {}) } });
  await logActivity(user, event.id, 'changed the event dates and timezone');
  revalidatePath(`/events/${slug}`, 'layout');
  revalidatePath(`/e/${slug}`, 'layout');
  return { ok: 'Saved.' };
}

export async function archiveEvent(slug: string) {
  const { user, event } = await requirePermission(slug, can.manageEvent);
  await prisma.event.update({ where: { id: event.id }, data: { archivedAt: new Date() } });
  await logActivity(user, event.id, 'archived the event');
  revalidatePath('/events', 'layout');
  redirect('/events');
}

export async function restoreEvent(fd: FormData) {
  const user = await requireUser();
  if (!can.manageEvent(user.role)) return;
  const e = await prisma.event.findFirst({ where: { id: String(fd.get('id') ?? ''), organisationId: user.organisationId } });
  if (!e) return;
  await prisma.event.update({ where: { id: e.id }, data: { archivedAt: null } });
  await logActivity(user, e.id, 'restored the event');
  revalidatePath('/events', 'layout');
  redirect(`/events/${e.slug}`);
}

/* ------------------------------------------------------------------ */
/* The event's own domain (enterprise)                                  */
/* ------------------------------------------------------------------ */

async function domainContext(slug: string) {
  const { user, event } = await requirePermission(slug, can.manageEvent);
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: event.organisationId }, select: { plan: true, planStatus: true } });
  return { user, event, allowed: org.plan === 'ENTERPRISE' && org.planStatus === 'ACTIVE' };
}

export async function setCustomDomain(slug: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, event, allowed } = await domainContext(slug);
  if (!allowed) return failed('Your own domain comes with the government and enterprise plan.');
  const domain = normaliseDomain(String(fd.get('domain') ?? ''));
  if (!domain) return failed('Enter a web address such as events.yourcompany.com, without https://');
  if (domain === domainTarget() || domain.endsWith('.zemmz.com')) return failed('Use a domain your organisation owns.');
  if (await prisma.event.findFirst({ where: { customDomain: domain, id: { not: event.id } } })) return failed(`${domain} is already used by another event.`);
  await prisma.event.update({ where: { id: event.id }, data: { customDomain: domain, customDomainToken: newDomainToken(), customDomainVerifiedAt: null } });
  await logActivity(user, event.id, `set the website address to ${domain}`);
  revalidatePath(`/events/${slug}/settings`);
  return done('Now add the two DNS records below, then check them.');
}

export async function verifyCustomDomain(slug: string, _p: ActionState, _fd: FormData): Promise<ActionState> {
  const { user, event } = await domainContext(slug);
  if (!event.customDomain) return failed('Add the domain first.');
  if (!(await hasTxt(`_zemmz.${event.customDomain}`, event.customDomainToken))) return failed(`We couldn’t find the TXT record at _zemmz.${event.customDomain} yet. DNS changes can take up to an hour.`);
  if (!(await pointsHere(event.customDomain))) return failed(`${event.customDomain} doesn’t point at ${domainTarget()} yet. Check the CNAME record.`);
  await prisma.event.update({ where: { id: event.id }, data: { customDomainVerifiedAt: new Date() } });
  await logActivity(user, event.id, `connected ${event.customDomain}`);
  revalidatePath(`/events/${slug}`, 'layout');
  return done(`Connected. https://${event.customDomain} shows the event website; the secure certificate is issued on the first visit.`);
}

export async function removeCustomDomain(slug: string) {
  const { user, event } = await domainContext(slug);
  await prisma.event.update({ where: { id: event.id }, data: { customDomain: null, customDomainToken: '', customDomainVerifiedAt: null } });
  await logActivity(user, event.id, `removed the website address ${event.customDomain}`);
  revalidatePath(`/events/${slug}`, 'layout');
}
