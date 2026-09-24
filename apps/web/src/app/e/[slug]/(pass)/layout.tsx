import Link from 'next/link';
import { getPublicEvent } from '@/lib/public-event';
import { logoUrlFor } from '@/lib/assets';

/** Pages an attendee owns (tickets, certificates). They work even during maintenance. */
export default async function PassLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getPublicEvent(slug);
  const logoUrl = await logoUrlFor(event);
  return (
    <>
      <header className="top no-print">
        <div className="wrap">
          <Link href={`/e/${slug}`} className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logoUrl ? <img src={logoUrl} alt="" className="logo-img" /> : <span className="mark" aria-hidden="true">{event.shortName}</span>}
            <span className="t"><b>{event.name}</b><small>{event.organiserName}</small></span>
          </Link>
        </div>
      </header>
      <main className="wrap py-10">{children}</main>
    </>
  );
}
