'use client';

import { useActionState } from 'react';
import { keepValues } from '@/lib/use-keep-values';
import { sendContact, type ContactState } from './actions';

export function ContactForm({ about }: { about: string }) {
  const [state, action, pending] = useActionState<ContactState, FormData>(sendContact, {});
  if (state.ok) return <div className="notice ok" role="status">{state.ok}</div>;
  return (
    <form action={action} onSubmit={keepValues(action)} noValidate>
      {state.error && <div className="notice err" role="alert">{state.error}</div>}
      <input type="hidden" name="about" value={about} />
      <input type="text" name="website" tabIndex={-1} autoComplete="off" hidden aria-hidden="true" />
      <div className="row2">
        <div className="fld"><label htmlFor="cn">Name</label><input id="cn" name="name" className="inp" autoComplete="name" required /></div>
        <div className="fld"><label htmlFor="ce">Work email</label><input id="ce" name="email" type="email" className="inp" autoComplete="email" required /></div>
      </div>
      <div className="fld"><label htmlFor="co">Organisation</label><input id="co" name="organisation" className="inp" autoComplete="organization" /></div>
      <div className="fld"><label htmlFor="cm">What kind of events, and how many a year?<span className="opt">(optional)</span></label><textarea id="cm" name="message" className="inp" style={{ height: 100, padding: '12px 14px' }} maxLength={3000} /></div>
      <button className="btn primary full" disabled={pending}>{pending ? 'Sending…' : 'Send message'}</button>
    </form>
  );
}
