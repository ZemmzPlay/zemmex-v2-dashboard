import 'server-only';
import type { FieldKind, Prisma } from '@zemmz/db';
import { eventType, type EventTypeKey } from '@zemmz/shared';

/**
 * What a new event starts with, by type. The organiser can change all of it;
 * the point is that nobody faces an empty form builder.
 */
export function defaultsFor(type: EventTypeKey) {
  const t = eventType(type);
  const f = (key: string, label: string, kind: FieldKind, required: boolean, extra: Partial<Prisma.FormFieldCreateWithoutEventInput> = {}) => ({ key, label, kind, required, ...extra });

  const fields: Prisma.FormFieldCreateWithoutEventInput[] = [
    ...(t.titles ? [f('title', 'Title', 'DROPDOWN', true, { options: ['Prof', 'Dr', 'Mr', 'Mrs', 'Ms'] })] : []),
    f('first', 'First name', 'TEXT', true, { locked: true }),
    f('last', 'Last name', 'TEXT', true, { locked: true }),
    f('email', 'Email', 'EMAIL', true, { locked: true }),
    ...(t.openForm === 'Tickets' ? [f('tk', 'Ticket', 'TICKET', true, { locked: true })] : []),
    f('spec', t.f1, t.f1 === 'Ticket' ? 'TEXT' : 'TEXT', t.credits, { enabled: t.f1 !== 'Ticket' }),
    f('hosp', t.f2, 'TEXT', false),
    f('mob', 'Mobile', 'PHONE', t.gates),
  ].map((x, i) => ({ ...x, sortOrder: i }));

  const tickets: Prisma.TicketTypeCreateWithoutEventInput[] =
    t.openForm === 'Tickets'
      ? [{ name: 'Standard', description: 'General admission', priceMinor: 0, capacity: 500, onSale: false, sortOrder: 0 }]
      : [{ name: t.credits ? 'Healthcare professional' : 'Registration', description: 'Free', priceMinor: 0, capacity: null, onSale: true, sortOrder: 0 }];

  return {
    fields,
    tickets,
    template: {
      kind: 'CONFIRMATION' as const,
      kicker: t.gates ? 'YOUR E-TICKET' : t.openForm === 'Tickets' ? 'YOUR TICKET' : 'REGISTRATION',
      subject: `Your ${t.one === 'ticket' ? 'ticket' : t.one} for {event_name} ({registration_id})`,
      bodyHtml: `<p>Hi <b>{first_name}</b>,</p><p>You’re confirmed for {event_name} on {event_dates} at {venue}.</p><p>Your ${t.idName.toLowerCase()} is <b>{registration_id}</b>. ${t.gates ? 'Show the e-ticket at your gate.' : 'Bring it to the registration desk to collect your badge.'}</p>`,
    },
    certificate:
      t.cert === 'none'
        ? null
        : {
            title: t.cert === 'cme' ? 'Certificate of Attendance' : t.key === 'workshop' ? 'Certificate of Completion' : 'Certificate of Attendance',
            bodyText: t.cert === 'cme' ? 'We certify that the above participant is entitled to claim {credits} CME/CPD credits.' : 'This certifies that the above participant attended {sessions}.',
            signerName: '', signerRole: 'Organiser', issueDateText: '', minSessions: 1,
          },
    afterPage: t.cert === 'none' ? { showRecordings: t.key === 'summit', showSlides: t.key === 'summit', showPhotos: true, showSurvey: true, attendeesOnly: t.key === 'summit', message: 'Thank you for coming.' } : null,
  };
}
