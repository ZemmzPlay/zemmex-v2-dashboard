import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@zemmz/db';
import { eventType } from '@zemmz/shared';
import { can, requirePermission } from '@/lib/auth';
import { fullName } from '@/lib/format';
import { BadgeCard } from '@/components/badge-card';
import { Icon } from '@/components/icon';
import { PrintButton } from './print-button';
import { markPrinted } from '../../actions';

export const metadata: Metadata = { title: 'Print badge' };

export default async function BadgePage({ params }: { params: Promise<{ slug: string; publicId: string }> }) {
  const { slug, publicId: pid } = await params;
  const { event } = await requirePermission(slug, can.checkIn);
  const TY = eventType(event.type);
  const reg = await prisma.registration.findUnique({
    where: { eventId_publicId: { eventId: event.id, publicId: Number(pid) || 0 } },
    include: { ticketType: { include: { gates: { select: { title: true } } } } },
  });
  if (!reg || reg.status === 'CANCELLED') notFound();

  return (
    <>
      <style>{`@media print { @page { size: A6; margin: 8mm; } .sb, .topbar, .crumbs, .ph { display: none !important; } .app { display: block; } .view { padding: 0; } .badge-card { box-shadow: none; border: 0; max-width: none; } }`}</style>
      <nav className="crumbs no-print" aria-label="Breadcrumb">
        <Link href={`/events/${slug}/registrations`}>{TY.regs}</Link> <Icon name="chevr" size={12} />
        <Link href={`/events/${slug}/registrations/${reg.publicId}`}>{fullName(reg)}</Link> <Icon name="chevr" size={12} /> <span>Print {TY.badge}</span>
      </nav>
      <div className="ph no-print">
        <div>
          <h1>Print {TY.badge}</h1>
          <p>The barcode works with any handheld scanner at check-in.</p>
        </div>
        <div className="actions">
          <PrintButton label={`Print ${TY.badge}`} onPrinted={markPrinted.bind(null, slug, reg.publicId)} />
        </div>
      </div>
      <BadgeCard
        event={event}
        name={fullName(reg)}
        line1={TY.gates ? undefined : reg.field1}
        line2={TY.gates ? reg.field2 : reg.field2}
        ticket={reg.ticketType?.name}
        gate={TY.gates ? reg.ticketType?.gates[0]?.title : undefined}
        publicId={reg.publicId}
      />
    </>
  );
}
