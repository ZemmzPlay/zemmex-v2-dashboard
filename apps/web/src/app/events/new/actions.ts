'use server';

import { redirect } from 'next/navigation';
import { prisma } from '@zemmz/db';
import { newEventSchema } from '@zemmz/shared';
import { can, requireUser } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { defaultsFor } from '@/lib/event-defaults';

export interface NewEventState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function createEvent(_p: NewEventState, fd: FormData): Promise<NewEventState> {
  const user = await requireUser();
  if (!can.manageEvent(user.role)) return { error: 'Only owners and admins can create events.' };
  const parsed = newEventSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { error: 'Check the highlighted fields.', fieldErrors };
  }
  const d = parsed.data;
  if (['new', 'admin', 'api', 'login'].includes(d.slug) || (await prisma.event.findUnique({ where: { slug: d.slug } }))) {
    return { error: 'Check the highlighted fields.', fieldErrors: { slug: 'That web address is taken. Try adding the year.' } };
  }
  const def = defaultsFor(d.type);
  const short = d.name.split(/\s+/).filter((w) => /^[A-Za-z0-9]/.test(w)).map((w) => w[0]).join('').slice(0, 3).toUpperCase() || 'EV';
  const event = await prisma.event.create({
    data: {
      organisationId: user.organisationId, type: d.type, name: d.name, shortName: short, slug: d.slug, timezone: d.timezone,
      startsOn: new Date(d.startDate), endsOn: new Date(d.endDate), currency: d.currency, venueName: d.venue, organiserName: user.organisationName,
      registrationOpen: false,
      formFields: { create: def.fields },
      ticketTypes: { create: def.tickets },
      templates: { create: def.template },
      ...(def.certificate ? { certificate: { create: def.certificate } } : {}),
      ...(def.afterPage ? { afterPage: { create: def.afterPage } } : {}),
    },
  });
  await logActivity(user, event.id, `created ${event.name}`);
  redirect(`/events/${event.slug}?created=1`);
}
