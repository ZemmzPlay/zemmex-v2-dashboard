import type { EventTypeDef } from '@zemmz/shared';

/** The website's built-in pages after Home, as [key, menu label, path under /e/<slug>]. */
export function builtInPages(TY: EventTypeDef): [string, string, string][] {
  return [
    ['people', TY.people, '/people'],
    ['programme', TY.gates ? 'Set times' : TY.credits ? 'Sessions' : 'Agenda', '/programme'],
    ['venue', 'Venue', '/venue'],
  ];
}
