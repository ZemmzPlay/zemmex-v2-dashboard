'use client';

import Link from 'next/link';
import { useState } from 'react';

const Svg = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);

/** The marketing header (live-marketing.html, nav()). */
export function MarketingNav({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const links: [string, string][] = [['/#how', 'How it works'], ['/#who', 'Who it’s for'], ['/#pricing', 'Pricing'], ['/zemmz-play', 'Tournaments'], ['/help', 'Help']];
  return (
    <header className="znav">
      <div className="w">
        <Link href="/" aria-label="zemmz Live home"><span className="zlogo" role="img" aria-label="zemmz" /></Link>
        <nav className="lk" aria-label="Main">{links.map(([h, l]) => <Link key={h} href={h}>{l}</Link>)}</nav>
        <div className="r">
          {signedIn ? (
            <Link className="zb p sm" href="/events">Go to your dashboard</Link>
          ) : (
            <>
              <Link className="si" href="/login">Sign in</Link>
              <Link className="zb s sm" href="/signup">Start free trial</Link>
              <Link className="zb p sm" href="/contact?about=demo">Book a demo</Link>
            </>
          )}
          <button className="bg" type="button" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <Svg d={open ? 'M18 6 6 18M6 6l12 12' : 'M4 7h16M4 12h16M4 17h16'} />
          </button>
        </div>
      </div>
      <div className={`zmm ${open ? 'open' : ''}`} onClick={() => setOpen(false)}>
        {links.map(([h, l]) => <Link key={h} href={h}>{l}</Link>)}
        {signedIn ? <Link href="/events">Your dashboard</Link> : <><Link href="/login">Sign in</Link><Link href="/signup">Start free trial</Link></>}
      </div>
    </header>
  );
}
