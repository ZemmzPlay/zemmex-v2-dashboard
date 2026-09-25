'use server';

import { z } from 'zod';
import { prisma, type Prisma, type Role } from '@zemmz/db';
import { CURRENCIES, emailSchema, evaluationTemplate, eventType, hexColourSchema, isCurrency, zonedTime, EVENT_TYPE_KEYS } from '@zemmz/shared';
import { can, requireUser } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { sendInvitation } from '@/lib/accounts';
import { defaultsFor } from '@/lib/event-defaults';
import { fieldOptions } from '@/lib/onboarding';
import { paymentsReady } from '@/lib/payments';

const schema = z.object({
  type: z.enum(EVENT_TYPE_KEYS),
  name: z.string().trim().min(3, 'Name your event.').max(120),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the date.'),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the last day.'),
  venue: z.string().trim().max(160).default(''),
  timezone: z.string().min(1),
  currency: z.string(),
  paid: z.enum(['free', 'paid', 'mixed']),
  tickets: z.array(z.object({ name: z.string().trim().min(1, 'Name each ticket type or remove it.').max(80), price: z.number().min(0).max(1_000_000) })).min(1, 'Add at least one ticket type.').max(12),
  accredited: z.enum(['yes', 'pending', 'no']).default('yes'),
  provider: z.string().trim().max(160).default(''),
  activity: z.string().trim().max(60).default(''),
  rule: z.enum(['duration', 'checkin']).default('duration'),
  gates: z.number().int().min(1).max(4).default(1),
  passOut: z.boolean().default(true),
  recordings: z.boolean().default(true),
  photos: z.boolean().default(true),
  survey: z.boolean().default(true),
  minSessions: z.number().int().min(1).max(10).default(1),
  evaluationFirst: z.boolean().default(false),
  fields: z.record(z.boolean()),
  colour: hexColourSchema,
  invites: z.array(z.object({ email: z.string(), role: z.enum(['ADMIN', 'EDITOR', 'CHECKIN']) })).max(20),
  plan: z.enum(['EVENT', 'SEASON', 'ENTERPRISE']),
});

export type OnboardingData = z.input<typeof schema>;
export interface FinishResult { slug?: string; error?: string; step?: number }

const tzOk = (tz: string) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } };

/** Creates the event and everything the answers imply, in one transaction. */
export async function finishOnboarding(input: OnboardingData): Promise<FinishResult> {
  const user = await requireUser();
  if (!can.manageEvent(user.role)) return { error: 'Only owners and admins can create events.' };
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const path = String(parsed.error.issues[0].path[0]);
    const step = ['type'].includes(path) ? 3 : ['name', 'start', 'end', 'venue', 'timezone', 'currency'].includes(path) ? 4 : path === 'tickets' || path === 'paid' ? 5 : path === 'colour' ? 8 : path === 'invites' ? 9 : 6;
    return { error: parsed.error.issues[0].message, step };
  }
  const d = parsed.data;
  const TY = eventType(d.type);
  if (d.end < d.start) return { error: 'The last day must be on or after the first day.', step: 4 };
  if (!tzOk(d.timezone)) return { error: 'Choose a timezone.', step: 4 };
  const currency = isCurrency(d.currency) ? d.currency : 'AED';
  const exp = CURRENCIES[currency].exponent;
  const invites = d.invites.filter((i) => i.email.trim());
  for (const i of invites) if (!emailSchema.safeParse(i.email).success) return { error: `${i.email} isn’t a valid email. Fix it or remove the row.`, step: 9 };

  // A readable, unique web address from the name.
  const stem = d.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'event';
  let slug = stem;
  for (let n = 2; ['new', 'admin', 'api', 'login'].includes(slug) || (await prisma.event.findUnique({ where: { slug } })); n++) slug = `${stem}-${n}`;
  const short = d.name.split(/\s+/).filter((w) => /^[A-Za-z0-9]/.test(w)).map((w) => w[0]).join('').slice(0, 3).toUpperCase() || 'EV';

  const def = defaultsFor(d.type);
  // Form fields: built-ins switched on or off, chosen extras added after them.
  const opts = fieldOptions(d.type);
  const chosen = (k: string) => d.fields[k] ?? opts.find((o) => o.key === k)?.on ?? false;
  const fields = def.fields.map((f) => (opts.some((o) => o.builtIn && o.key === f.key) ? { ...f, enabled: chosen(f.key) } : f));
  for (const o of opts.filter((x) => !x.builtIn && chosen(x.key))) {
    fields.push({ key: o.key, label: o.label.replace(/ \(.*\)$/, ''), kind: o.kind, required: false, enabled: true, options: o.options ?? [], sortOrder: fields.length });
  }

  const prices = d.tickets.map((t) => (d.paid === 'free' ? 0 : Math.round(t.price * 10 ** exp)));
  const tickets: Prisma.TicketTypeCreateWithoutEventInput[] = d.tickets.map((t, i) => ({ name: t.name, priceMinor: prices[i], capacity: null, onSale: true, sortOrder: i, description: '' }));

  const medicalNoCme = TY.credits && d.accredited === 'no';
  const certificate = def.certificate && {
    ...def.certificate,
    minSessions: TY.credits ? 1 : d.minSessions,
    provider: TY.credits ? d.provider : '',
    activityNumber: TY.credits ? d.activity : '',
    bodyText: medicalNoCme ? 'This certifies that the above participant attended {sessions}.' : TY.credits && d.provider ? 'This activity is accredited by {provider}. The above participant is entitled to claim {credits} CME/CPD credits.' : def.certificate.bodyText,
  };
  const afterPage = def.afterPage && { ...def.afterPage, showRecordings: !TY.gates && d.recordings, showSlides: !TY.gates && d.recordings, showPhotos: d.photos, showSurvey: d.survey };

  const event = await prisma.$transaction(async (tx) => {
    const e = await tx.event.create({
      data: {
        organisationId: user.organisationId, type: d.type, name: d.name, shortName: short, slug, timezone: d.timezone,
        startsOn: new Date(`${d.start}T00:00:00Z`), endsOn: new Date(`${TY.gates && d.end < d.start ? d.start : d.end}T00:00:00Z`),
        currency, venueName: d.venue, organiserName: user.organisationName, accentColour: d.colour.toUpperCase(),
        // Free registration opens straight away; paid tickets once card payments are set up.
        registrationOpen: prices.every((p) => p === 0) || paymentsReady(),
        creditRule: d.rule, requireEvaluation: TY.credits || TY.cert === 'attendance' ? d.evaluationFirst : false,
        allowPassOut: d.passOut,
        formFields: { create: fields },
        ticketTypes: { create: tickets },
        templates: { create: def.template },
        ...(certificate ? { certificate: { create: certificate } } : {}),
        ...(afterPage ? { afterPage: { create: afterPage } } : {}),
      },
      include: { ticketTypes: { orderBy: { sortOrder: 'asc' } } },
    });
    if (TY.gates) {
      // Gates open at 18:00 on the day; matched to ticket types when the numbers agree.
      const match = d.gates === e.ticketTypes.length;
      const opens = zonedTime(d.start, '18:00', d.timezone);
      await tx.session.createMany({
        data: Array.from({ length: d.gates }, (_, i) => ({
          eventId: e.id, kind: 'GATE' as const, title: `Gate ${'ABCD'[i]}${match ? ` · ${e.ticketTypes[i].name}` : ''}`,
          startsAt: opens, endsAt: new Date(opens.getTime() + 8 * 3_600_000), gateTicketTypeId: match ? e.ticketTypes[i].id : null, sortOrder: i,
        })),
      });
    }
    const questions = evaluationTemplate(TY);
    await tx.evaluationQuestion.createMany({ data: questions.map((q, i) => ({ eventId: e.id, text: q.text, kind: q.kind, groupName: q.group, required: q.required, sortOrder: i })) });
    await tx.organisation.update({ where: { id: user.organisationId }, data: { plan: d.plan } });
    return e;
  });

  await logActivity(user, event.id, `created ${event.name}`);
  for (const i of invites) {
    const email = emailSchema.parse(i.email);
    const existing = await prisma.user.findUnique({ where: { email }, include: { memberships: true } });
    if (existing?.memberships.length) continue;
    await sendInvitation({ organisationId: user.organisationId, organisationName: user.organisationName, email, role: i.role as Role, invitedBy: user });
    await logActivity(user, null, `invited ${email}`);
  }
  return { slug: event.slug };
}
