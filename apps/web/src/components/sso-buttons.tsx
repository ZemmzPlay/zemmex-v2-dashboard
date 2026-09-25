/** "Continue with Microsoft / Google", when configured. Plain links: the flow starts on the server. */
export function SsoButtons({ providers, next = '', verb = 'Continue', position = 'after' }: { providers: { key: string; label: string }[]; next?: string; verb?: string; position?: 'before' | 'after' }) {
  if (!providers.length) return null;
  const buttons = providers.map((p) => (
    <a key={p.key} href={`/auth/${p.key}/start${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="btn ghost full" style={{ marginTop: 8 }}>
      {p.key === 'microsoft' && <MicrosoftMark />}
      {p.key === 'google' && <GoogleMark />}
      {verb} with {p.label}
    </a>
  ));
  return position === 'before' ? <>{buttons}<div className="or">or with email</div></> : <><div className="or">or</div>{buttons}</>;
}

function MicrosoftMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={{ marginRight: 8 }}>
      <path fill="#F25022" d="M0 0h7.5v7.5H0z" /><path fill="#7FBA00" d="M8.5 0H16v7.5H8.5z" /><path fill="#00A4EF" d="M0 8.5h7.5V16H0z" /><path fill="#FFB900" d="M8.5 8.5H16V16H8.5z" />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true" style={{ marginRight: 8 }}>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.3 5.7c4.3-3.9 7-9.8 7-17.1z" />
      <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.7 2.3-8.6 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}
