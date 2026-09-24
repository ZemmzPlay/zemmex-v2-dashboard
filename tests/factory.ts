import { prisma, type EventType } from '@zemmz/db';

/** Empties every table. Only ever runs against zemmz_test (see global-setup). */
export async function resetDb() {
  if (!/zemmz_test/.test(process.env.DATABASE_URL ?? '')) throw new Error('Not the test database');
  await prisma.organisation.deleteMany();
  await prisma.user.deleteMany();
  // Outbox rows outlive their event (eventId is set to null), so clear them too.
  await prisma.outboundMessage.deleteMany();
}

export async function makeEvent(opts: { type?: EventType; trial?: boolean; tickets?: { name: string; priceMinor?: number; capacity?: number | null }[] } = {}) {
  const org = await prisma.organisation.create({ data: { name: 'Test org', slug: `org-${Math.random().toString(36).slice(2, 8)}`, planStatus: opts.trial ? 'TRIAL' : 'ACTIVE' } });
  const user = await prisma.user.create({ data: { name: 'Door staff', email: `door-${Math.random().toString(36).slice(2, 8)}@test`, passwordHash: 'x', memberships: { create: { organisationId: org.id, role: 'CHECKIN' } } } });
  const event = await prisma.event.create({
    data: {
      organisationId: org.id, type: opts.type ?? 'medical', name: 'Test Summit', shortName: 'TS', slug: `ev-${Math.random().toString(36).slice(2, 10)}`,
      timezone: 'Asia/Kuwait', startsOn: new Date('2026-09-22'), endsOn: new Date('2026-09-23'),
      templates: { create: { kind: 'CONFIRMATION', subject: 'You’re registered ({registration_id})', bodyHtml: '<p>Hi {first_name}</p>' } },
      ticketTypes: { create: (opts.tickets ?? [{ name: 'Delegate' }]).map((t, i) => ({ name: t.name, priceMinor: t.priceMinor ?? 0, capacity: t.capacity ?? null, sortOrder: i })) },
    },
    include: { ticketTypes: { orderBy: { sortOrder: 'asc' } } },
  });
  return { org, user, event };
}

export const person = (i: number, ticketTypeId: string | null) => ({
  ticketTypeId, title: '', firstName: `Person${i}`, lastName: 'Test', email: `p${i}@example.com`, mobile: '', field1: '', field2: '', answers: {},
});
