import 'server-only';
import { prisma, type Registration } from '@zemmz/db';
import { formatMoney } from '@zemmz/shared';
import type { FieldDef } from '@/components/person-form';

/** `forOrganiser`: only name and email are required when staff add or edit someone. */
export async function loadFormFields(eventId: string, currency: string, opts: { forOrganiser?: boolean } = {}) {
  const [fields, tickets] = await Promise.all([
    prisma.formField.findMany({ where: { eventId }, orderBy: { sortOrder: 'asc' } }),
    prisma.ticketType.findMany({ where: { eventId }, orderBy: { sortOrder: 'asc' } }),
  ]);
  const defs: FieldDef[] = fields.map((f) => ({ key: f.key, label: f.label, kind: f.kind, required: opts.forOrganiser ? f.locked && f.required : f.required, enabled: f.enabled, options: f.options }));
  // Events without a ticket picker field still get one when they have several ticket types.
  if (tickets.length > 1 && !defs.some((d) => d.kind === 'TICKET')) {
    defs.splice(3, 0, { key: 'tk', label: 'Ticket', kind: 'TICKET', required: true, enabled: true, options: [] });
  }
  return {
    fields: defs,
    tickets: tickets.map((t) => ({ id: t.id, label: `${t.name} · ${formatMoney(t.priceMinor, currency, { freeLabel: true })}${t.onSale ? '' : ' (not on sale)'}` })),
    ticketRows: tickets,
  };
}

export function initialValues(r: Registration): Record<string, string> {
  const answers = (r.answers ?? {}) as Record<string, string>;
  return { ...answers, title: r.title, first: r.firstName, last: r.lastName, email: r.email, mob: r.mobile, spec: r.field1, hosp: r.field2, tk: r.ticketTypeId ?? '' };
}
