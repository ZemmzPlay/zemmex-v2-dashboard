'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@zemmz/db';
import { contrastRatio, eventType, hexColourSchema, sanitizeRichText, textOn } from '@zemmz/shared';
import { can, requirePermission } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { done, failed, type ActionState } from '@/lib/action-state';
import { builtInPages } from '@/lib/site-pages';

const refresh = (slug: string) => {
  revalidatePath(`/events/${slug}`, 'layout');
  revalidatePath(`/e/${slug}`, 'layout');
};

/* ---------- general, venue, theme ---------- */

export async function saveGeneral(slug: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, event } = await requirePermission(slug, can.editContent);
  const parsed = z.object({ heroText: z.string().trim().max(240, 'Keep the introduction under 240 characters'), siteLanguage: z.enum(['EN', 'AR', 'BOTH']) }).safeParse({ heroText: fd.get('heroText') ?? '', siteLanguage: fd.get('siteLanguage') ?? event.siteLanguage });
  if (!parsed.success) return failed(parsed.error.issues[0].message);
  await prisma.event.update({ where: { id: event.id }, data: parsed.data });
  await logActivity(user, event.id, parsed.data.siteLanguage !== event.siteLanguage ? `set the website language to ${{ EN: 'English', AR: 'Arabic', BOTH: 'English and Arabic' }[parsed.data.siteLanguage]}` : 'edited the homepage introduction');
  refresh(slug);
  return done('Saved. The homepage shows it now.');
}

const venueSchema = z.object({
  venueName: z.string().trim().max(160, 'Keep the venue name under 160 characters'),
  venueAddress: z.string().trim().max(240, 'Keep the address under 240 characters'),
  venuePhone: z.string().trim().max(40, 'Keep the phone number under 40 characters'),
});

export async function saveVenue(slug: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, event } = await requirePermission(slug, can.editContent);
  const parsed = venueSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return failed(parsed.error.issues[0].message);
  await prisma.event.update({ where: { id: event.id }, data: parsed.data });
  await logActivity(user, event.id, 'edited the venue');
  refresh(slug);
  return done('Venue saved.');
}

export interface ThemeState extends ActionState { warn?: string }

export async function saveTheme(slug: string, _p: ThemeState, fd: FormData): Promise<ThemeState> {
  const { user, event } = await requirePermission(slug, can.editContent);
  const parsed = hexColourSchema.safeParse(fd.get('accentColour'));
  if (!parsed.success) return failed(parsed.error.issues[0].message);
  const colour = parsed.data.toUpperCase();
  await prisma.event.update({ where: { id: event.id }, data: { accentColour: colour } });
  await logActivity(user, event.id, `changed the event colour to ${colour}`);
  refresh(slug);
  // Contrast is checked, not assumed: buttons use whichever text colour reads better.
  const ratio = contrastRatio(colour, textOn(colour));
  return { ...done('Colour saved.'), warn: ratio < 4.5 ? `Button text reaches only ${ratio.toFixed(1)}:1 on this colour. Choose a darker or lighter shade so it’s easy to read.` : undefined };
}

/* ---------- registration form ---------- */

const BUILT_IN = new Set(['title', 'first', 'last', 'email', 'mob', 'spec', 'hosp', 'tk']);

async function ownField(eventId: string, id: string) {
  return prisma.formField.findFirst({ where: { id, eventId } });
}

export async function setFieldFlag(slug: string, id: string, flag: 'required' | 'enabled', value: boolean) {
  const { user, event } = await requirePermission(slug, can.editContent);
  const f = await ownField(event.id, id);
  // Locked fields are needed for badges, tickets and emails.
  if (!f || f.locked) return;
  await prisma.formField.update({ where: { id }, data: { [flag]: value } });
  await logActivity(user, event.id, `${flag === 'enabled' ? (value ? 'showed' : 'hid') : value ? 'made required' : 'made optional'} the ${f.label} field`);
  refresh(slug);
}

export async function moveField(slug: string, id: string, by: -1 | 1) {
  const { event } = await requirePermission(slug, can.editContent);
  const all = await prisma.formField.findMany({ where: { eventId: event.id }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true } });
  const i = all.findIndex((f) => f.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  await prisma.$transaction(all.map((f, n) => prisma.formField.update({ where: { id: f.id }, data: { sortOrder: n } })));
  refresh(slug);
}

const optionsFrom = (raw: FormDataEntryValue | null) =>
  [...new Set(String(raw ?? '').split('\n').map((o) => o.trim()).filter(Boolean))];

const fieldSchema = z.object({
  label: z.string().trim().min(1, 'Name the field').max(60, 'Keep the field name under 60 characters'),
  kind: z.enum(['TEXT', 'PHONE', 'DROPDOWN', 'DATE']).optional(),
});

function checkOptions(kind: string, options: string[]) {
  if (kind !== 'DROPDOWN') return null;
  if (options.length < 2) return 'A dropdown needs at least two options, one per line';
  if (options.length > 60) return 'Keep a dropdown to 60 options';
  if (options.some((o) => o.length > 80)) return 'Keep each option under 80 characters';
  return null;
}

export async function addField(slug: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, event } = await requirePermission(slug, can.editContent);
  const parsed = fieldSchema.safeParse({ label: fd.get('label'), kind: fd.get('kind') });
  if (!parsed.success || !parsed.data.kind) return failed(parsed.success ? 'Choose the type of answer' : parsed.error.issues[0].message);
  const { label, kind } = parsed.data;
  const options = optionsFrom(fd.get('options'));
  const bad = checkOptions(kind, options);
  if (bad) return failed(bad);

  // Custom answers are stored under this key on each registration, so it never changes.
  const stem = label.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'field';
  const taken = new Set((await prisma.formField.findMany({ where: { eventId: event.id }, select: { key: true } })).map((f) => f.key));
  let key = BUILT_IN.has(stem) ? `${stem}_2` : stem;
  for (let n = 2; taken.has(key); n++) key = `${stem}_${n}`;

  const last = await prisma.formField.findFirst({ where: { eventId: event.id }, orderBy: { sortOrder: 'desc' } });
  await prisma.formField.create({
    data: { eventId: event.id, key, label, kind, options: kind === 'DROPDOWN' ? options : [], required: fd.get('required') === 'on', enabled: true, sortOrder: (last?.sortOrder ?? -1) + 1 },
  });
  await logActivity(user, event.id, `added the ${label} field to the registration form`);
  refresh(slug);
  return done(`${label} added to the form.`);
}

export async function editField(slug: string, id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, event } = await requirePermission(slug, can.editContent);
  const f = await ownField(event.id, id);
  if (!f) return failed('That field no longer exists. Reload the page.');
  const parsed = fieldSchema.safeParse({ label: fd.get('label') });
  if (!parsed.success) return failed(parsed.error.issues[0].message);
  const options = optionsFrom(fd.get('options'));
  const bad = checkOptions(f.kind, options);
  if (bad) return failed(bad);
  await prisma.formField.update({ where: { id }, data: { label: parsed.data.label, ...(f.kind === 'DROPDOWN' ? { options } : {}) } });
  await logActivity(user, event.id, `edited the ${parsed.data.label} field`);
  refresh(slug);
  return done('Field saved.');
}

export async function deleteField(slug: string, fd: FormData) {
  const { user, event } = await requirePermission(slug, can.editContent);
  const f = await ownField(event.id, String(fd.get('id') ?? ''));
  if (!f || f.locked || BUILT_IN.has(f.key)) return;
  await prisma.formField.delete({ where: { id: f.id } });
  await logActivity(user, event.id, `deleted the ${f.label} field from the registration form`);
  refresh(slug);
}

/* ---------- pages and menu ---------- */

const pageSchema = z.object({
  title: z.string().trim().min(1, 'Give the page a title').max(60, 'Keep the title under 60 characters, it appears in the menu'),
  bodyHtml: z.string().max(100_000, 'This page is too long. Split it into two pages.').default(''),
});

export async function savePage(slug: string, id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, event } = await requirePermission(slug, can.editContent);
  const parsed = pageSchema.safeParse({ title: fd.get('title'), bodyHtml: fd.get('bodyHtml') ?? '' });
  if (!parsed.success) return failed(parsed.error.issues[0].message);
  const page = await prisma.sitePage.findFirst({ where: { id, eventId: event.id } });
  if (!page) return failed('That page no longer exists. Reload the page.');
  await prisma.sitePage.update({ where: { id }, data: { title: parsed.data.title, bodyHtml: sanitizeRichText(parsed.data.bodyHtml) } });
  await logActivity(user, event.id, `published the ${parsed.data.title} page`);
  refresh(slug);
  return done(`${parsed.data.title} published.`);
}

export async function addPage(slug: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, event } = await requirePermission(slug, can.editContent);
  const parsed = pageSchema.pick({ title: true }).safeParse({ title: fd.get('title') });
  if (!parsed.success) return failed(parsed.error.issues[0].message);
  const { title } = parsed.data;
  const stem = title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'page';
  const taken = new Set((await prisma.sitePage.findMany({ where: { eventId: event.id }, select: { key: true } })).map((p) => p.key));
  let key = stem;
  for (let n = 2; taken.has(key); n++) key = `${stem}-${n}`;
  const last = await prisma.sitePage.findFirst({ where: { eventId: event.id }, orderBy: { sortOrder: 'desc' } });
  await prisma.sitePage.create({ data: { eventId: event.id, key, title, bodyHtml: `<h2>${title.replace(/[<>&]/g, '')}</h2><p></p>`, inNav: false, sortOrder: (last?.sortOrder ?? -1) + 1 } });
  await logActivity(user, event.id, `added the ${title} page`);
  refresh(slug);
  redirect(`/events/${slug}/website?tab=pages&page=${key}`);
}

export async function deletePage(slug: string, fd: FormData) {
  const { user, event } = await requirePermission(slug, can.editContent);
  const page = await prisma.sitePage.findFirst({ where: { id: String(fd.get('id') ?? ''), eventId: event.id } });
  if (!page) return;
  await prisma.sitePage.delete({ where: { id: page.id } });
  await logActivity(user, event.id, `deleted the ${page.title} page`);
  refresh(slug);
  redirect(`/events/${slug}/website?tab=pages`);
}

export async function setPageInNav(slug: string, id: string, inNav: boolean) {
  const { user, event } = await requirePermission(slug, can.editContent);
  const page = await prisma.sitePage.findFirst({ where: { id, eventId: event.id } });
  if (!page) return;
  await prisma.sitePage.update({ where: { id }, data: { inNav } });
  await logActivity(user, event.id, `${inNav ? 'added' : 'removed'} the ${page.title} page ${inNav ? 'to' : 'from'} the menu`);
  refresh(slug);
}

export async function setBuiltInInNav(slug: string, key: string, shown: boolean) {
  const { user, event } = await requirePermission(slug, can.editContent);
  const page = builtInPages(eventType(event.type)).find(([k]) => k === key);
  if (!page) return;
  const hidden = new Set(event.navHidden);
  if (shown) hidden.delete(key);
  else hidden.add(key);
  await prisma.event.update({ where: { id: event.id }, data: { navHidden: [...hidden] } });
  await logActivity(user, event.id, `${shown ? 'showed' : 'hid'} the ${page[1]} page in the website menu`);
  refresh(slug);
}
