import type { Tournament } from '@zemmz/db';
import { arabicOf, CURRENCIES, isCurrency } from '@zemmz/shared';
import { prizeList } from '@/lib/play/bracket';
import type { TournamentValues } from './tournament-form';

/** A date and a time in a timezone, for the form's inputs. */
function parts(d: Date, tz: string) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const g = (t: string) => f.find((p) => p.type === t)?.value ?? '';
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}` };
}

export function formValues(t: Tournament | null, tz: string): TournamentValues {
  const now = Date.now();
  const day = 86_400_000;
  const d = (x: Date | undefined, fallback: number, time: string) => (x ? parts(x, tz) : { date: parts(new Date(now + fallback), tz).date, time });
  const ro = d(t?.regOpensAt, 0, '18:00'), rc = d(t?.regClosesAt, 7 * day, '23:59'), st = d(t?.startsAt, 9 * day, '19:00'), en = d(t?.endsAt, 11 * day, '23:00');
  const exp = t && isCurrency(t.currency) ? CURRENCIES[t.currency].exponent : 2;
  const ar = t ? arabicOf(t) : {};
  return {
    name: t?.name ?? '', nameAr: typeof ar.name === 'string' ? ar.name : '', game: t?.game ?? 'val', format: t?.format ?? 'SINGLE_ELIMINATION', teamSize: t?.teamSize ?? 1,
    capacity: t?.capacity ?? 64, platform: t?.platform ?? '', timezone: t?.timezone ?? tz,
    regOpensDate: ro.date, regOpensTime: ro.time, regClosesDate: rc.date, regClosesTime: rc.time, startsDate: st.date, startsTime: st.time, endsDate: en.date, endsTime: en.time,
    bestOf: t?.bestOf ?? 3, countries: t?.countries ?? ['KW', 'SA', 'AE', 'QA', 'BH', 'OM'], playersReport: t?.playersReport ?? true, verifiedOnly: t?.verifiedOnly ?? false, checkIn: t?.checkIn ?? false,
    currency: t?.currency ?? 'AED', entryFee: t ? String(t.entryFeeMinor / 10 ** exp) : '0',
    prizes: t ? prizeList(t.prizes).map((p) => ({ place: p.place, amount: p.amountMinor ? String(p.amountMinor / 10 ** exp) : '', label: p.label })) : [],
    description: t?.description ?? '', descriptionAr: typeof ar.description === 'string' ? ar.description : '',
  };
}
