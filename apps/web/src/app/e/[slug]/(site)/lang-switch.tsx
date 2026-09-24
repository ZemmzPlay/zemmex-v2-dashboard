'use client';

import { usePathname } from 'next/navigation';

/** English ⇄ العربية, back to the same page. */
export function LangSwitch({ slug, to, label }: { slug: string; to: 'en' | 'ar'; label: string }) {
  const path = usePathname();
  return (
    <a className="langsw" href={`/e/${slug}/lang?to=${to}&back=${encodeURIComponent(path)}`} lang={to} hrefLang={to}>
      {label}
    </a>
  );
}
