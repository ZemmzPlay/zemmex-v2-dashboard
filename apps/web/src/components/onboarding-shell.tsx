import Link from 'next/link';

const Check = () => <svg className="i" viewBox="0 0 24 24" style={{ width: 14, height: 14 }} aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;

/** The onboarding frame: steps down the side, progress on top (live-marketing.html, onboarding()). */
export function OnboardingShell({ steps, current, children, signIn = true }: { steps: string[]; current: number; children: React.ReactNode; signIn?: boolean }) {
  const done = current >= steps.length;
  return (
    <div className="ob">
      <aside className="ob-side">
        <Link href="/" aria-label="zemmz Live home"><span className="zlogo" /></Link>
        <ol className="ob-steps" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {steps.map((s, i) => (
            <li key={s} className={`ob-step ${i < current ? 'done' : i === current ? 'cur' : ''}`} aria-current={i === current ? 'step' : undefined}>
              <span className="d">{i < current ? <Check /> : i + 1}</span>{s}
            </li>
          ))}
        </ol>
        <div className="foot">{signIn ? <>Already have an account? <Link href="/login" style={{ color: '#fff', fontWeight: 600 }}>Sign in</Link></> : <>Need help? <a href="mailto:hello@zemmz.com" style={{ color: '#fff' }}>hello@zemmz.com</a></>}</div>
      </aside>
      <main className="ob-main">
        {!done && (
          <div className="ob-top">
            <span>Step {current + 1} of {steps.length}</span>
            <span className="prog" aria-hidden="true"><i style={{ width: `${Math.round((current / steps.length) * 100)}%` }} /></span>
          </div>
        )}
        <div className="ob-card">{children}</div>
      </main>
    </div>
  );
}
