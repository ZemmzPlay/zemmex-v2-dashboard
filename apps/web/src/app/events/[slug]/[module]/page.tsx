import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eventType } from '@zemmz/shared';
import { can, requirePermission } from '@/lib/auth';
import { Icon } from '@/components/icon';

/**
 * Modules from the prototype that are designed but not yet built in this
 * codebase. They stay in the navigation so the product's shape is visible,
 * and each says plainly what it will do. See docs/HANDOVER.md, "Build order".
 */
const MODULES: Record<string, (t: ReturnType<typeof eventType>) => { title: string; what: string }> = {
  tickets: () => ({ title: 'Tickets', what: 'Ticket types with price, capacity and sales; on-sale switches; promo codes; payment settings. Ticket types and promo codes already exist in the database and the public checkout uses them.' }),
  certificates: (t) => ({
    title: t.certNav,
    what: t.cert === 'cme'
      ? 'How CME points are earned, who is eligible, an editable certificate with a live preview per delegate, and the accreditation wording. Points are already calculated from scans, and the public site already issues certificates to people who attended.'
      : t.cert === 'attendance'
        ? 'Certificates of attendance: the minimum sessions attended, and the certificate template with a live preview.'
        : 'What the after-event page shows (recordings, slides, photos, survey) and whether only people who came can open it.',
  }),
  evaluation: (t) => ({ title: t.evalNav, what: t.credits ? 'The KIMS evaluation report with averages, ticked statements and comments, and the form builder. Questions and sample responses are already in the database.' : 'The feedback report and form builder.' }),
  people: (t) => ({ title: t.people, what: `The ${t.people.toLowerCase()} list with photos, categories, biographies and display order${t.gates ? ', and set times' : ''}. The public site already shows them.` }),
  website: () => ({ title: 'Website', what: 'General details, the registration form builder with live preview, page editor, venue, menu, and theme with a contrast check.' }),
  raffle: (t) => ({ title: t.raffle, what: 'Draw from people who checked in, exclude past winners, and show the result full screen for the stage.' }),
};

export async function generateMetadata({ params }: { params: Promise<{ module: string }> }): Promise<Metadata> {
  return { title: (await params).module };
}

export default async function ModulePage({ params }: { params: Promise<{ slug: string; module: string }> }) {
  const { slug, module } = await params;
  const def = MODULES[module];
  if (!def) notFound();
  const { event } = await requirePermission(slug, can.seeDashboard);
  const m = def(eventType(event.type));
  return (
    <>
      <div className="ph"><div><h1>{m.title}</h1><p>{event.name}</p></div></div>
      <div className="card empty">
        <div className="ic"><Icon name="tool" size={24} /></div>
        <h3>Designed, not built yet</h3>
        <p className="!max-w-[520px]">{m.what}</p>
        <Link href={`/events/${slug}`} className="btn secondary">Back to the dashboard</Link>
      </div>
    </>
  );
}
