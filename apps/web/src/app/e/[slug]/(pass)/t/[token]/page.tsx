import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@zemmz/db';
import { eventType, formatDateRange } from '@zemmz/shared';
import { siteTextFor } from '@/lib/site-locale';
import { getPublicEvent } from '@/lib/public-event';
import { readTicketToken } from '@/lib/tokens';
import { fullName } from '@/lib/format';
import { BadgeCard } from '@/components/badge-card';
import { logoUrlFor } from '@/lib/assets';
import { PrintLink } from '../../print-link';

export const metadata: Metadata = { title: 'Your ticket', robots: { index: false } };

export default async function TicketPage({ params, searchParams }: { params: Promise<{ slug: string; token: string }>; searchParams: Promise<{ new?: string }> }) {
  const { slug, token } = await params;
  const { new: isNew } = await searchParams;
  const event = await getPublicEvent(slug);
  const logoUrl = await logoUrlFor(event);
  const TY = eventType(event.type);
  const { t, locale } = await siteTextFor(event);
  const id = readTicketToken(token);
  const reg = id ? await prisma.registration.findFirst({ where: { id, eventId: event.id }, include: { ticketType: { include: { gates: { select: { title: true } } } } } }) : null;
  if (!reg) notFound();

  return (
    <div className="mx-auto max-w-[520px] text-center">
      {reg.status === 'CANCELLED' ? (
        <div className="note err">{t.cancelledTicket}</div>
      ) : (
        <>
          {isNew && (
            <div className="no-print mb-6">
              <div className="mx-auto mb-3 grid h-13 w-13 place-items-center rounded-full bg-[var(--ok-soft)] text-2xl text-[var(--ok)]" aria-hidden="true">✓</div>
              <h1 className="m-0 text-[28px] font-bold" style={{ fontFamily: 'var(--serif)' }}>{t.registered}</h1>
              <p className="text-[var(--ink-2)]">{t.emailedTo(reg.email)}</p>
            </div>
          )}
          <div className="idbox no-print"><small>{t.v.idName}</small><b>{reg.publicId}</b></div>
          <BadgeCard
              logoUrl={logoUrl}
            event={event}
            name={fullName(reg)}
            line1={TY.gates ? undefined : reg.field1}
            line2={reg.field2}
            ticket={reg.ticketType?.name}
            gate={TY.gates ? reg.ticketType?.gates[0]?.title : undefined}
            publicId={reg.publicId}
            text={{ badgeKicker: t.badgeKicker, entry: t.entry, idName: t.v.idName, badge: t.v.badge }}
            dateRange={formatDateRange(event.startsOn, event.endsOn, 'UTC', locale)}
          />
          <p className="no-print mt-6"><PrintLink label={t.printBadge} /></p>
        </>
      )}
    </div>
  );
}
