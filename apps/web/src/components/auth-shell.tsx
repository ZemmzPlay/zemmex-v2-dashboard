import Link from 'next/link';

/** Sign-in, reset, invitation and onboarding: the navy side panel and a card (live-marketing.html, shell()). */
export function AuthShell({ children, side, foot }: { children: React.ReactNode; side?: React.ReactNode; foot?: React.ReactNode }) {
  return (
    <div className="ob">
      <aside className="ob-side">
        <Link href="/" aria-label="zemmz Live home"><span className="zlogo" /></Link>
        {side ?? <blockquote>Registration, check-in at the door, and certificates afterwards. One system your team can run without training.</blockquote>}
        <div className="foot">{foot ?? <>Need help? <a href="mailto:hello@zemmz.com" style={{ color: '#fff' }}>hello@zemmz.com</a></>}</div>
      </aside>
      <main className="ob-main">
        <div className="ob-card">{children}</div>
      </main>
    </div>
  );
}
