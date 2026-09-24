import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@zemmz/db';
import { eventType } from '@zemmz/shared';
import { getPublicEvent, homeState } from '@/lib/public-event';
import { loadFormFields } from '@/lib/form-fields';
import { getQuote, placeOrder } from '../../actions';
import { CheckoutFlow } from './checkout-flow';

export const metadata: Metadata = { title: 'Checkout', robots: { index: false } };

export default async function CheckoutPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string }> }) {
  const { slug } = await params;
  const { t = '' } = await searchParams;
  const event = await getPublicEvent(slug);
  const TY = eventType(event.type);

  if (homeState(event) !== 'open') {
    return (
      <div className="wrap py-20 text-center">
        <h1 className="sec-t">{TY.openForm === 'Tickets' ? 'Ticket sales are closed' : 'Registration is closed'}</h1>
        <Link href={`/e/${slug}`} className="btn line mt-4">Back to the event</Link>
      </div>
    );
  }

  const tickets = await prisma.ticketType.findMany({
    where: { eventId: event.id, onSale: true },
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { registrations: { where: { status: 'CONFIRMED' } } } } },
  });
  const initial: Record<string, number> = {};
  for (const part of t.split(',')) {
    const [id, n] = part.split(':');
    if (tickets.some((x) => x.id === id) && Number(n) > 0) initial[id] = Math.min(10, Math.floor(Number(n)));
  }
  const form = await loadFormFields(event.id, event.currency);

  return (
    <div className="wrap max-w-[760px] py-12">
      <Link href={`/e/${slug}`} className="text-[14px] font-semibold no-underline">← {event.name}</Link>
      <h1 className="sec-t mt-3">{TY.openForm === 'Tickets' ? 'Get tickets' : 'Register'}</h1>
      <CheckoutFlow
        slug={slug}
        currency={event.currency}
        tickets={tickets.map((x) => ({ id: x.id, name: x.name, description: x.description, priceMinor: x.priceMinor, left: x.capacity == null ? null : Math.max(0, x.capacity - x._count.registrations) }))}
        initial={initial}
        fields={form.fields.filter((f) => f.kind !== 'TICKET')}
        quoteAction={getQuote.bind(null, slug)}
        orderAction={placeOrder.bind(null, slug)}
        idName={TY.idName}
        gates={TY.gates}
      />
    </div>
  );
}
