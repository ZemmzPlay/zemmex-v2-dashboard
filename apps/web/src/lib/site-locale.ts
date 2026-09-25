import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import type { Event } from '@zemmz/db';
import { eventType, siteText, type Locale } from '@zemmz/shared';

export const LANG_COOKIE = 'zlang';

/** The visitor's language on this event's site: fixed by the organiser, or their choice when the site has both. */
export const siteLocale = cache(async (event: Pick<Event, 'siteLanguage'>): Promise<Locale> => {
  if (event.siteLanguage === 'AR') return 'ar';
  if (event.siteLanguage === 'EN') return 'en';
  return (await cookies()).get(LANG_COOKIE)?.value === 'ar' ? 'ar' : 'en';
});

export async function siteTextFor(event: Event) {
  const locale = await siteLocale(event);
  return { t: siteText(eventType(event.type), locale), locale };
}
