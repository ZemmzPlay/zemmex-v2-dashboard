import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@zemmz/db';
import { eventType } from '@zemmz/shared';
import { can, requirePermission } from '@/lib/auth';
import { fullName } from '@/lib/format';
import { BadgeCard } from '@/components/badge-card';
import { logoUrlFor } from '@/lib/assets';
import { Icon } from '@/components/icon';
import { PrintButton } from '../[publicId]/badge/print-button';
import { markPrintedMany } from '../actions';

export const metadata: Metadata = { title: 'Print badges' };

/** Several badges or e-tickets at once, one per printed page. */
export default async function PrintMany({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ id?: string | string[] }> }) {
  const { slug } = await params;
  const raw = (await searchParams).id;
  const ids = [...new Set((Array.isArray(raw) ? raw : raw ? [raw] : []).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))].slice(0, 200);
  const { event } = await requirePermission(slug, can.checkIn);
  const logoUrl = await logoUrlFor(event);
  const TY = eventType(event.type);
  const regs = ids.length
    ? await prisma.registration.findMany({ where: { eventId: event.id, publicId: { in: ids }, status: 'CONFIRMED' }, orderBy: { publicId: 'asc' }, include: { ticketType: { include: { gates: { select: { title: true } } } } } })
    : [];

  return (
    <>
      <style>{`@media print { @page { size: A6; margin: 8mm; } .sb, .topbar, .crumbs, .ph { display: none !important; } .app { display: block; } .view { padding: 0; } .badge-card { box-shadow: none; border: 0; max-width: none; } .bp { break-after: page; } }`}</style>
      <nav className="crumbs no-print" aria-label="Breadcrumb">
        <Link href={`/events/${slug}/registrations`}>{TY.regs}</Link> <Icon name="chevr" size={12} /> <span>Print {TY.badge}s</span>
      </nav>
      <div className="ph no-print">
        <div>
          <h1>Print {regs.length} {regs.length === 1 ? TY.badge : `${TY.badge}s`}</h1>
          <p>{regs.length ? 'Each prints on its own page.' : `Nobody selected. Go back and tick the people whose ${TY.badge}s you want.`}</p>
        </div>
        {regs.length > 0 && <div className="actions"><PrintButton label="Print all" onPrinted={markPrintedMany.bind(null, slug, regs.map((r) => r.publicId))} /></div>}
      </div>
      <div className="flex flex-col gap-6">
        {regs.map((reg) => (
          <div className="bp" key={reg.id}>
            <BadgeCard
              logoUrl={logoUrl}
              event={event}
              name={fullName(reg)}
              line1={TY.gates ? undefined : reg.field1}
              line2={reg.field2}
              ticket={reg.ticketType?.name}
              gate={TY.gates ? reg.ticketType?.gates[0]?.title : undefined}
              publicId={reg.publicId}
            />
          </div>
        ))}
      </div>
    </>
  );
}
