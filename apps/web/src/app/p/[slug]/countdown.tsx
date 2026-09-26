'use client';

import { useEffect, useState } from 'react';

/** Days, hours, minutes and seconds to a moment; rendered after load so server and browser agree. */
export function Countdown({ at, locale }: { at: string; locale: 'en' | 'ar' }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  if (now == null) return <b />;
  const s = Math.max(0, Math.floor((new Date(at).getTime() - now) / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const u = locale === 'ar' ? ['ي', 'س', 'د', 'ث'] : ['d', 'h', 'm', 's'];
  return <b dir="ltr">{d}{u[0]} {String(h).padStart(2, '0')}{u[1]} {String(m).padStart(2, '0')}{u[2]} {String(sec).padStart(2, '0')}{u[3]}</b>;
}
