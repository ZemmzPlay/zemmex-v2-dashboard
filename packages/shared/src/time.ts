/**
 * Dates as `22–23 September 2026`, times 24-hour. Every event has an IANA
 * timezone and times are always shown in it — the original Figma had no
 * timezone anywhere (docs/06, finding 2).
 */

const parts = (d: Date, tz: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, ...opts }).format(d);

/** `13:40` */
export function formatTime(d: Date, tz: string): string {
  return parts(d, tz, { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** `22 September 2026` */
export function formatDate(d: Date, tz: string): string {
  return parts(d, tz, { day: 'numeric', month: 'long', year: 'numeric' });
}

/** `Tuesday 22 September` */
export function formatDay(d: Date, tz: string): string {
  return parts(d, tz, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** `22 Sep, 13:40` */
export function formatShortDateTime(d: Date, tz: string): string {
  return `${parts(d, tz, { day: 'numeric', month: 'short' })}, ${formatTime(d, tz)}`;
}

/** `22–23 September 2026`, `30 September – 1 October 2026`, `22 September 2026` */
export function formatDateRange(start: Date, end: Date, tz: string): string {
  const s = { d: parts(start, tz, { day: 'numeric' }), m: parts(start, tz, { month: 'long' }), y: parts(start, tz, { year: 'numeric' }) };
  const e = { d: parts(end, tz, { day: 'numeric' }), m: parts(end, tz, { month: 'long' }), y: parts(end, tz, { year: 'numeric' }) };
  if (s.y !== e.y) return `${s.d} ${s.m} ${s.y} – ${e.d} ${e.m} ${e.y}`;
  if (s.m !== e.m) return `${s.d} ${s.m} – ${e.d} ${e.m} ${e.y}`;
  if (s.d !== e.d) return `${s.d}–${e.d} ${s.m} ${s.y}`;
  return `${s.d} ${s.m} ${s.y}`;
}

/** Calendar date key `2026-09-22` in the event's timezone, for grouping by day. */
export function dayKey(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Offset of `tz` from UTC at instant `d`, in minutes (Asia/Dubai → 240). */
export function tzOffsetMinutes(d: Date, tz: string): number {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - d.getTime()) / 60000);
}

/**
 * The UTC instant for a wall-clock time in `tz`.
 * `zonedTime('2026-09-22', '13:40', 'Asia/Kuwait')` → 2026-09-22T10:40:00Z
 */
export function zonedTime(date: string, time: string, tz: string): Date {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi));
  const off = tzOffsetMinutes(guess, tz);
  return new Date(guess.getTime() - off * 60000);
}

/** `HH:MM` wall-clock in `tz`, for filling `<input type="time">`. */
export function wallTime(d: Date, tz: string): string {
  return formatTime(d, tz);
}

export const GULF_TIMEZONES = [
  ['Asia/Dubai', 'UAE and Oman (GMT+4)'],
  ['Asia/Muscat', 'Oman (GMT+4)'],
  ['Asia/Kuwait', 'Kuwait (GMT+3)'],
  ['Asia/Riyadh', 'Saudi Arabia (GMT+3)'],
  ['Asia/Qatar', 'Qatar (GMT+3)'],
  ['Asia/Bahrain', 'Bahrain (GMT+3)'],
] as const;
