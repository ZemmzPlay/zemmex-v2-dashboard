import type { Metadata } from 'next';
import { getPublicEvent } from '@/lib/public-event';

export const metadata: Metadata = { title: 'Venue' };

export default async function VenuePage({ params }: { params: Promise<{ slug: string }> }) {
  const event = await getPublicEvent((await params).slug);
  const q = encodeURIComponent([event.venueName, event.venueAddress].filter(Boolean).join(', '));
  return (
    <div className="wrap pb-20">
      <div className="page-h"><h1>{event.venueName || 'Venue'}</h1></div>
      <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
        <div className="prose">
          {event.venueAddress && <p className="text-[17px]">{event.venueAddress}</p>}
          {event.venuePhone && <p>Telephone: <a href={`tel:${event.venuePhone.replace(/\s/g, '')}`}>{event.venuePhone}</a></p>}
          {q && (
            <p className="flex flex-wrap gap-3">
              <a className="btn accent" href={`https://www.google.com/maps/search/?api=1&query=${q}`} target="_blank" rel="noopener noreferrer">Directions in Google Maps</a>
              <a className="btn line" href={`https://maps.apple.com/?q=${q}`} target="_blank" rel="noopener noreferrer">Apple Maps</a>
            </p>
          )}
        </div>
        {/* A map embed needs a provider key and consent for its cookies; left as a link until one is chosen. */}
        <div className="grid min-h-[280px] place-items-center rounded-xl border border-[var(--line)] bg-[var(--bg-2)] p-6 text-center text-[var(--muted)]">
          <div>
            <b className="block text-[var(--ink)]">{event.venueName}</b>
            <span>{event.venueAddress}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
