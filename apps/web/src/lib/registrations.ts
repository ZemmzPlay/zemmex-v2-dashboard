import 'server-only';
import { prisma, Prisma, type Event, type FormField, type RegistrationSource } from '@zemmz/db';
import { renderConfirmation } from './email';

export interface PersonInput {
  ticketTypeId: string | null;
  title: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  field1: string;
  field2: string;
  answers: Record<string, string>;
  consentMarketing?: boolean;
}

export class RegistrationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
  }
}

/** Built-in form field keys and where their values live on Registration. */
const BUILT_IN: Record<string, keyof PersonInput> = {
  title: 'title', first: 'firstName', last: 'lastName', email: 'email', mob: 'mobile', spec: 'field1', hosp: 'field2', tk: 'ticketTypeId',
};

/**
 * Checks a submission against the event's own form: required fields,
 * dropdown values. Returns errors keyed by form field key.
 */
export function validateAgainstForm(fields: FormField[], p: PersonInput): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    if (!f.enabled || f.kind === 'TICKET') continue;
    const prop = BUILT_IN[f.key];
    const value = String(prop ? (p[prop] ?? '') : (p.answers[f.key] ?? '')).trim();
    if (f.required && !value) {
      errors[f.key] = f.kind === 'DROPDOWN' ? `Choose your ${f.label.toLowerCase()}` : `Enter your ${f.label.toLowerCase()}`;
      continue;
    }
    if (value && f.kind === 'DROPDOWN' && f.options.length && !f.options.includes(value)) {
      errors[f.key] = `Choose one of the options for ${f.label.toLowerCase()}`;
    }
    if (value && f.kind === 'DATE' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      errors[f.key] = 'Enter a date like 2000-01-31';
    }
  }
  return errors;
}

/**
 * Creates one registration per person, each with its own public ID, and
 * queues a confirmation email for each. Runs in one transaction:
 *
 * 1. Increments Event.nextPublicId for the whole batch. That UPDATE takes a
 *    row lock on the event, so concurrent registrations for the same event
 *    queue behind each other — IDs never collide and capacity checks below
 *    can't be raced into overselling.
 * 2. Checks each ticket type is on sale and has room.
 */
export async function createRegistrations(opts: {
  event: Event;
  people: PersonInput[];
  source: RegistrationSource;
  orderId?: string | null;
  /** Organisers can add people to sold-out or closed ticket types. */
  bypassSales?: boolean;
  tx?: Prisma.TransactionClient;
}) {
  const run = async (tx: Prisma.TransactionClient) => {
    const n = opts.people.length;
    const [row] = await tx.$queryRaw<{ nextPublicId: number }[]>`
      UPDATE "Event" SET "nextPublicId" = "nextPublicId" + ${n} WHERE id = ${opts.event.id} RETURNING "nextPublicId"`;
    const first = row.nextPublicId - n;

    const wanted = new Map<string, number>();
    for (const p of opts.people) if (p.ticketTypeId) wanted.set(p.ticketTypeId, (wanted.get(p.ticketTypeId) ?? 0) + 1);
    const types = await tx.ticketType.findMany({ where: { eventId: opts.event.id, id: { in: [...wanted.keys()] } } });
    for (const [id, count] of wanted) {
      const t = types.find((x) => x.id === id);
      if (!t) throw new RegistrationError('That ticket is no longer available. Choose another.', 'ticketTypeId');
      if (opts.bypassSales) continue;
      if (!t.onSale) throw new RegistrationError(`${t.name} tickets are not on sale.`, 'ticketTypeId');
      if (t.capacity != null) {
        const sold = await tx.registration.count({ where: { ticketTypeId: id, status: 'CONFIRMED' } });
        if (sold + count > t.capacity) {
          const left = Math.max(0, t.capacity - sold);
          throw new RegistrationError(left ? `Only ${left} ${t.name} ${left === 1 ? 'ticket is' : 'tickets are'} left.` : `${t.name} is sold out.`, 'ticketTypeId');
        }
      }
    }

    const template = await tx.messageTemplate.findUnique({ where: { eventId_kind: { eventId: opts.event.id, kind: 'CONFIRMATION' } } });
    const created = [];
    for (const [i, p] of opts.people.entries()) {
      const reg = await tx.registration.create({
        data: {
          eventId: opts.event.id, publicId: first + i, title: p.title, firstName: p.firstName, lastName: p.lastName,
          email: p.email.toLowerCase(), mobile: p.mobile, field1: p.field1, field2: p.field2, answers: p.answers,
          ticketTypeId: p.ticketTypeId, orderId: opts.orderId ?? null, source: opts.source, consentMarketing: !!p.consentMarketing,
        },
      });
      if (template) {
        const ticket = types.find((t) => t.id === p.ticketTypeId) ?? null;
        const m = renderConfirmation(opts.event, template, reg, ticket);
        await tx.outboundMessage.create({
          data: { eventId: opts.event.id, registrationId: reg.id, channel: 'EMAIL', toAddress: reg.email, toName: `${reg.firstName} ${reg.lastName}`, subject: m.subject, html: m.html, text: m.text },
        });
      }
      created.push(reg);
    }
    return created;
  };
  return opts.tx ? run(opts.tx) : prisma.$transaction(run);
}

/** Queues the confirmation email again, e.g. from the dashboard. */
export async function resendConfirmation(event: Event, registrationId: string) {
  const reg = await prisma.registration.findFirstOrThrow({ where: { id: registrationId, eventId: event.id }, include: { ticketType: true } });
  const template = await prisma.messageTemplate.findUniqueOrThrow({ where: { eventId_kind: { eventId: event.id, kind: 'CONFIRMATION' } } });
  const m = renderConfirmation(event, template, reg, reg.ticketType);
  await prisma.outboundMessage.create({
    data: { eventId: event.id, registrationId: reg.id, channel: 'EMAIL', toAddress: reg.email, toName: `${reg.firstName} ${reg.lastName}`, subject: m.subject, html: m.html, text: m.text },
  });
  return reg;
}
