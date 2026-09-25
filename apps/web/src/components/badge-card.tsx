import type { Event } from '@zemmz/db';
import { eventType, formatDateRange, textOn } from '@zemmz/shared';
import { Barcode } from './barcode';

/**
 * The badge (sessions) or e-ticket (gates). Sized to print on A6 or a
 * standard 4×3 inch badge insert; see the print CSS in the badge page.
 */
export function BadgeCard({ event, name, line1, line2, ticket, publicId, gate, logoUrl, text, dateRange }: { event: Event; name: string; line1?: string; line2?: string; ticket?: string; publicId: number; gate?: string; logoUrl?: string | null; text?: { badgeKicker: string; entry: (g: string) => string; idName: string; badge: string }; dateRange?: string }) {
  const TY = eventType(event.type);
  const tx = text ?? { badgeKicker: TY.gates ? 'E-TICKET' : TY.role || 'BADGE', entry: (g: string) => `Entry: ${g}`, idName: TY.idName, badge: TY.badge };
  const ink = textOn(event.accentColour);
  return (
    <article className="badge-card mx-auto w-full max-w-[380px] overflow-hidden rounded-2xl border border-line bg-white text-[#0D0B2E] shadow-[var(--shadow)]" aria-label={`${tx.badge}: ${name}`}>
      <header className="px-6 pb-4 pt-5" style={{ background: event.accentColour, color: ink }}>
        <div className="flex items-start justify-between gap-3">
          <div className="text-[11px] font-bold tracking-[.12em] opacity-90">{tx.badgeKicker}</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logoUrl && <img src={logoUrl} alt="" className="h-9 max-w-[120px] rounded-md bg-white object-contain p-1" />}
        </div>
        <div className="mt-1 text-[18px] font-bold leading-tight tracking-[-0.01em]">{event.name}</div>
        <div className="mt-0.5 text-[12.5px] opacity-90">{dateRange ?? formatDateRange(event.startsOn, event.endsOn, 'UTC')}{event.venueName && ` · ${event.venueName}`}</div>
      </header>
      <div className="px-6 pb-5 pt-6">
        <div className="text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em]">{name}</div>
        {line1 && <div className="mt-2 text-[15px] font-semibold">{line1}</div>}
        {line2 && <div className="text-[13.5px] text-[#45445F]">{line2}</div>}
        {(ticket || gate) && (
          <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
            {ticket && <span className="rounded-md bg-[#EDEDF3] px-2 py-1 font-semibold">{ticket}</span>}
            {gate && <span className="rounded-md bg-[#EDEDF3] px-2 py-1 font-semibold">{tx.entry(gate)}</span>}
          </div>
        )}
        <div className="mt-6">
          <Barcode value={publicId} height={60} />
        </div>
        <div className="mt-1 text-center text-[11.5px] text-[#6B6A85]">{tx.idName} {publicId}</div>
      </div>
    </article>
  );
}
