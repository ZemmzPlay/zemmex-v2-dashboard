'use client';

import { useActionState } from 'react';
import { requestDemo, type ContactState } from '@/app/(marketing)/contact/actions';

export function DemoForm() {
  const [state, action, pending] = useActionState<ContactState, FormData>(requestDemo, {});
  return (
    <div className={`dm ${state.error ? 'bad' : ''}`} id="dm">
      <h2>Request a demo</h2>
      {state.ok ? <p className="ok" role="status">{state.ok}</p> : (
        <form action={action} noValidate>
          <label className="sr" htmlFor="dme">Work email</label>
          <input id="dme" name="email" type="email" autoComplete="email" placeholder="Your work email" defaultValue={state.values?.email} />
          <input type="text" name="website" tabIndex={-1} autoComplete="off" hidden aria-hidden="true" />
          <button className="zb" disabled={pending}>{pending ? 'Sending…' : 'Request demo'}</button>
        </form>
      )}
      <p className="err" role="alert">{state.error}</p>
    </div>
  );
}
