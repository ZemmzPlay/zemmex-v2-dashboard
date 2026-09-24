import 'server-only';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { prisma, type Event } from '@zemmz/db';
import { eventType, fixContrast, textOn } from '@zemmz/shared';

/** A public event by slug. Archived events are gone from the public web. */
export const getPublicEvent = cache(async (slug: string) => {
  const event = await prisma.event.findUnique({ where: { slug } });
  if (!event || event.archivedAt) notFound();
  return event;
});

export const getPublicPages = cache(async (eventId: string) =>
  prisma.sitePage.findMany({ where: { eventId }, orderBy: { sortOrder: 'asc' } }),
);

/**
 * The event's own colour, made safe: button text flips between white and
 * dark automatically, and links are darkened (or lightened on the concert's
 * dark theme) until they reach 4.5:1 against the page.
 */
export function themeFor(event: Event) {
  const TY = eventType(event.type);
  const dark = TY.basedOn === 'concert';
  const accent = event.accentColour;
  return {
    className: `site t-${TY.basedOn}`,
    style: {
      '--accent': accent,
      '--accent-ink': textOn(accent),
      '--accent-link': fixContrast(accent, dark ? '#0B0714' : '#FFFFFF'),
    } as React.CSSProperties,
  };
}

export type HomeState = 'maintenance' | 'after' | 'open' | 'closed';

/** Maintenance wins, then after-event, then registration — as on the dashboard preview. */
export function homeState(e: Pick<Event, 'maintenance' | 'afterEventOn' | 'registrationOpen'>): HomeState {
  return e.maintenance ? 'maintenance' : e.afterEventOn ? 'after' : e.registrationOpen ? 'open' : 'closed';
}
