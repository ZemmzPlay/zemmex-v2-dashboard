'use client';

import { useActionState } from 'react';
import { login, type LoginState } from './actions';

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} noValidate>
      <input type="hidden" name="next" value={next} />
      {state.error && (
        <div className="notice err mb-4" role="alert">
          {state.error}
        </div>
      )}
      <div className="fld">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" className="inp" autoComplete="username" placeholder="name@organisation.com" defaultValue={state.email} required autoFocus />
      </div>
      <div className="fld">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" className="inp" autoComplete="current-password" required />
      </div>
      <button className="btn primary w-full" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
