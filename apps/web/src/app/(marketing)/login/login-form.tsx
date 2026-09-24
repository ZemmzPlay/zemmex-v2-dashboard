'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { login, type LoginState } from './actions';

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} noValidate>
      <input type="hidden" name="next" value={next} />
      {state.error && <div className="notice err" role="alert">{state.error}</div>}
      <div className="fld">
        <label htmlFor="email">Work email</label>
        <input id="email" name="email" type="email" className="inp" autoComplete="username" placeholder="name@organisation.com" defaultValue={state.email} required autoFocus />
      </div>
      <div className="fld">
        <label htmlFor="password" style={{ display: 'flex', justifyContent: 'space-between' }}>
          Password <Link href="/forgot" className="linkbtn" style={{ fontSize: 13 }}>Forgot password?</Link>
        </label>
        <input id="password" name="password" type="password" className="inp" autoComplete="current-password" required />
      </div>
      <button className="btn primary full" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );
}
