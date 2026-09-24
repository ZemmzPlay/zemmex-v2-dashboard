export const fmt = (n: number) => Number(n).toLocaleString('en-US');

export const kfmt = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n));

export const plural = (n: number, word: string, pluralWord?: string) => `${fmt(n)} ${n === 1 ? word : pluralWord ?? word + 's'}`;

export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((w) => w && !/^(dr|prof|mr|mrs|ms)\.?$/i.test(w))
    .map((w) => w.replace(/^Al-/, '')[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function hue(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export function fullName(r: { title?: string | null; firstName: string; lastName: string }) {
  return r.title ? `${r.title} ${r.firstName} ${r.lastName}` : `${r.firstName} ${r.lastName}`;
}

/** "a" or "an" before a type noun: "Find an attendee", "Find a delegate". */
export const an = (w: string) => (/^[aeiou]/i.test(w) ? `an ${w.toLowerCase()}` : `a ${w.toLowerCase()}`);

export function relativeTime(d: Date, now = new Date()) {
  const s = Math.round((now.getTime() - d.getTime()) / 1000);
  if (s < 45) return 'Just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}
