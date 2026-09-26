import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import type { Event } from '@zemmz/db';
import { eventType, localise, siteText, type Locale } from '@zemmz/shared';

export const LANG_COOKIE = 'zlang';

/** The visitor's language on this event's site: fixed by the organiser, or their choice when the site has both. */
export const siteLocale = cache(async (event: Pick<Event, 'siteLanguage'>): Promise<Locale> => {
  if (event.siteLanguage === 'AR') return 'ar';
  if (event.siteLanguage === 'EN') return 'en';
  return (await cookies()).get(LANG_COOKIE)?.value === 'ar' ? 'ar' : 'en';
});

/**
 * The site's words in the visitor's language. On an Arabic page this also
 * swaps the event's own text (name, organiser, venue, introduction) for the
 * organiser's Arabic, in place: the event object is per request, so every
 * component on the page then shows the same language.
 */
export async function siteTextFor(event: Event) {
  const locale = await siteLocale(event);
  if (locale === 'ar') Object.assign(event, localise(event, 'ar'));
  return { t: siteText(eventType(event.type), locale), locale };
}
