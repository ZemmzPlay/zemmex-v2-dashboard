'use client';

import Link from 'next/link';
import { useActionState, useRef, useState, useTransition } from 'react';
import { keepValues } from '@/lib/use-keep-values';
import { createAccount, createOrganisation, resendCode, verifyCode, type SignupState } from './actions';
import { ORG_COUNTRIES, ORG_KINDS } from '@/lib/onboarding';

const Arrow = () => <svg className="i" viewBox="0 0 24 24" style={{ width: 16, height: 16 }} aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;

function score(p: string) {
  let s = 0;
  if (p.length >= 8) s++;
  if (/\d/.test(p)) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/[^\w]/.test(p) || p.length >= 12) s++;
  return p ? Math.max(1, s) : 0;
}

export function AccountStep({ plan, sso }: { plan: string; sso?: React.ReactNode }) {
  const [state, action, pending] = useActionState<SignupState, FormData>(createAccount, {});
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const f = state.fields ?? {};
  return (
    <form action={action} onSubmit={keepValues(action)} noValidate>
      <input type="hidden" name="plan" value={plan} />
      <h1>Create your account</h1>
      <p className="lead">{plan === 'PLAY' ? 'Start free. Your first tournament website comes with 14 days of the Season plan.' : 'Start free. Your first 50 attendees cost nothing.'}</p>
      {sso}
      {state.error && <div className="notice err" role="alert">{state.error} {state.error.includes('Sign in') && <Link href="/login" className="linkbtn">Sign in</Link>}</div>}
      <div className={`fld ${f.name ? 'bad' : ''}`}>
        <label htmlFor="o-name">Full name</label>
        <input id="o-name" name="name" className="inp" autoComplete="name" defaultValue={state.values?.name} autoFocus />
        <span className="err">{f.name}</span>
      </div>
      <div className={`fld ${f.email ? 'bad' : ''}`}>
        <label htmlFor="o-email">Work email</label>
        <input id="o-email" name="email" type="email" className="inp" autoComplete="email" placeholder="name@organisation.com" defaultValue={state.values?.email} />
        <span className="err">{f.email}</span>
      </div>
      <div className={`fld ${f.password ? 'bad' : ''}`}>
        <label htmlFor="o-pw">Password</label>
        <div className="pw">
          <input id="o-pw" name="password" type={show ? 'text' : 'password'} className="inp" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <button type="button" onClick={() => setShow((s) => !s)}>{show ? 'Hide' : 'Show'}</button>
        </div>
        <div className={`meter s${score(pw)}`} aria-hidden="true"><i /><i /><i /><i /></div>
        <span className="help">At least 8 characters, with a number.</span>
        <span className="err">{f.password}</span>
      </div>
      <p className="hintnote">By creating an account you agree to the <Link href="/terms">terms</Link> and <Link href="/privacy">privacy policy</Link>.</p>
      <div className="ob-nav">
        <Link href="/" className="btn ghost">Cancel</Link>
        <span className="sp" />
        <button className="btn primary" disabled={pending}>{pending ? 'Creating…' : 'Continue'} <Arrow /></button>
      </div>
    </form>
  );
}

export function VerifyStep({ email, plan }: { email: string; plan: string }) {
  const [state, action, pending] = useActionState<SignupState, FormData>(verifyCode, {});
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [resent, setResent] = useState<SignupState>({});
  const [resending, start] = useTransition();
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const set = (i: number, v: string) => {
    const clean = v.replace(/\D/g, '');
    if (clean.length > 1) {
      // Pasted the whole code.
      const next = clean.slice(0, 6).split('');
      setDigits([...next, ...Array(6 - next.length).fill('')]);
      refs.current[Math.min(next.length, 5)]?.focus();
      return;
    }
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (clean && i < 5) refs.current[i + 1]?.focus();
  };
  const msg = state.error ?? resent.error;
  return (
    <form action={action} onSubmit={keepValues(action)} noValidate>
      <h1>Check your email</h1>
      <p className="lead">We sent a 6-digit code to <b>{email}</b>. It works for 15 minutes.</p>
      {msg && <div className="notice err" role="alert">{msg}</div>}
      {resent.ok && !msg && <div className="notice ok" role="status">{resent.ok}</div>}
      <input type="hidden" name="code" value={digits.join('')} />
      <input type="hidden" name="plan" value={plan} />
      <div className="otp" role="group" aria-label="Verification code">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={6}
            aria-label={`Digit ${i + 1}`}
            value={d}
            autoFocus={i === 0}
            onChange={(e) => set(i, e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Backspace' && !d && i > 0) refs.current[i - 1]?.focus(); }}
          />
        ))}
      </div>
      <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>
        Nothing arrived? Check spam, or <button type="button" className="linkbtn" disabled={resending} onClick={() => start(async () => setResent(await resendCode()))}>send a new code</button>.
      </p>
      <div className="ob-nav">
        <span className="sp" />
        <button className="btn primary" disabled={pending || digits.join('').length < 6}>{pending ? 'Checking…' : 'Verify'} <Arrow /></button>
      </div>
    </form>
  );
}

const KINDS = ORG_KINDS;
const COUNTRIES = ORG_COUNTRIES;

export function OrganisationStep({ plan }: { plan: string }) {
  const [state, action, pending] = useActionState<SignupState, FormData>(createOrganisation, {});
  const [kind, setKind] = useState(state.values?.kind ?? '');
  const f = state.fields ?? {};
  return (
    <form action={action} onSubmit={keepValues(action)} noValidate>
      <h1>Your organisation</h1>
      <p className="lead">{plan === 'PLAY' ? 'Who runs your tournaments?' : 'Who runs your events?'}</p>
      <input type="hidden" name="plan" value={plan} />
      <input type="hidden" name="kind" value={kind} />
      <div className={`fld ${f.org ? 'bad' : ''}`}>
        <label htmlFor="o-org">Organisation name</label>
        <input id="o-org" name="org" className="inp" placeholder="For example, Zawaya Events" defaultValue={state.values?.org} autoFocus />
        <span className="err">{f.org}</span>
      </div>
      <div className={`fld ${f.kind ? 'bad' : ''}`}>
        <span className="lbl" id="kind-l">What best describes you?</span>
        <div className="chips" role="radiogroup" aria-labelledby="kind-l">
          {KINDS.map((k) => <button type="button" key={k} className="chip" role="radio" aria-checked={kind === k} aria-pressed={kind === k} onClick={() => setKind(k)}>{k}</button>)}
        </div>
        <span className="err">{f.kind}</span>
      </div>
      <div className="fld">
        <label htmlFor="o-country">Country</label>
        <select id="o-country" name="country" className="inp" defaultValue={state.values?.country ?? 'United Arab Emirates'}>
          {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="ob-nav">
        <span className="sp" />
        <button className="btn primary" disabled={pending}>{pending ? 'Saving…' : 'Continue'} <Arrow /></button>
      </div>
    </form>
  );
}
