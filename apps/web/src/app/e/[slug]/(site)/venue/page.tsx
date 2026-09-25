import type { Metadata } from 'next';
import { getPublicEvent } from '@/lib/public-event';
import { siteTextFor } from '@/lib/site-locale';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return { title: (await siteTextFor(await getPublicEvent((await params).slug))).t.venue };
}

export default async function VenuePage({ params }: { params: Promise<{ slug: string }> }) {
  const event = await getPublicEvent((await params).slug);
  const { t } = await siteTextFor(event);
  const q = encodeURIComponent([event.venueName, event.venueAddress].filter(Boolean).join(', '));
  return (
    <div className="wrap pb-20">
      <div className="page-h"><h1>{event.venueName || t.venue}</h1></div>
      <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
        <div className="prose">
          {event.venueAddress && <p className="text-[17px]">{event.venueAddress}</p>}
          {event.venuePhone && <p>{t.telephone} <a className="ltr" href={`tel:${event.venuePhone.replace(/\s/g, '')}`}>{event.venuePhone}</a></p>}
          {q && (
            <p className="flex flex-wrap gap-3">
              <a className="btn accent" href={`https://www.google.com/maps/search/?api=1&query=${q}`} target="_blank" rel="noopener noreferrer">{t.googleMaps}</a>
              <a className="btn line" href={`https://maps.apple.com/?q=${q}`} target="_blank" rel="noopener noreferrer">{t.appleMaps}</a>
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
