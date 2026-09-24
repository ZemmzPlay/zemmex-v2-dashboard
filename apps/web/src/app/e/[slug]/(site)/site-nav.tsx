'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function SiteNav({ links }: { links: [string, string][] }) {
  const path = usePathname();
  return (
    <nav className="links" aria-label="Event">
      {links.map(([href, label], i) => (
        <Link key={href} href={href} aria-current={(i === 0 ? path === href : path.startsWith(href)) ? 'page' : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
