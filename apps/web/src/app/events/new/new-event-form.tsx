'use client';

import { useActionState, useState } from 'react';
import { createEvent, type NewEventState } from './actions';

interface TypeOption { key: string; label: string; note: string }

const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 40);

export function NewEventForm({ types, timezones, host }: { types: TypeOption[]; timezones: readonly (readonly [string, string])[]; host: string }) {
  const [state, action, pending] = useActionState<NewEventState, FormData>(createEvent, {});
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const err = (k: string) => state.fieldErrors?.[k];
  const fld = (k: string) => `fld ${err(k) ? 'invalid' : ''}`;

  return (
    <form action={action} className="max-w-[760px]" noValidate>
      {state.error && <div className="notice err mb-4" role="alert">{state.error}</div>}
      <fieldset className="fsec m-0 mb-4">
        <legend className="sr-only">Type of event</legend>
        <h2 className="m-0 mb-1 text-[15px] font-semibold">What kind of event is it?</h2>
        <p className="hint">This sets the words the dashboard uses and which tools you get. Medical conferences add CME points and accredited certificates.</p>
        <div className="opt-cards">
          {types.map((t, i) => (
            <label className="opt-card" key={t.key}>
              <input type="radio" name="type" value={t.key} defaultChecked={i === 0} className="sr-only" required />
              <b>{t.label}</b>
              <small>{t.note}</small>
            </label>
          ))}
        </div>
      </fieldset>
      <section className="fsec">
        <div className={fld('name')}>
          <label htmlFor="name">Event name</label>
          <input id="name" name="name" className="inp" value={name} placeholder="e.g. 6th Gulf Heart Summit" onChange={(e) => { setName(e.target.value); if (!slugEdited) setSlug(slugify(e.target.value)); }} required />
          {err('name') && <span className="err">{err('name')}</span>}
        </div>
        <div className={fld('slug')}>
          <label htmlFor="slug">Web address</label>
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap text-[13px] text-muted">{host}/e/</span>
            <input id="slug" name="slug" className="inp flex-1" value={slug} onChange={(e) => { setSlug(e.target.value); setSlugEdited(true); }} required pattern="[a-z0-9-]+" />
          </div>
          {err('slug') ? <span className="err">{err('slug')}</span> : <span className="help">Lowercase letters, numbers and hyphens.</span>}
        </div>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <div className={fld('startDate')}>
            <label htmlFor="startDate">First day</label>
            <input id="startDate" name="startDate" type="date" className="inp" required />
            {err('startDate') && <span className="err">{err('startDate')}</span>}
          </div>
          <div className={fld('endDate')}>
            <label htmlFor="endDate">Last day</label>
            <input id="endDate" name="endDate" type="date" className="inp" required />
            {err('endDate') && <span className="err">{err('endDate')}</span>}
          </div>
          <div className="fld">
            <label htmlFor="timezone">Timezone</label>
            <select id="timezone" name="timezone" className="sel" defaultValue="Asia/Dubai">
              {timezones.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <span className="help">Every time on the website and in the dashboard is shown in this timezone.</span>
          </div>
          <div className="fld">
            <label htmlFor="currency">Currency</label>
            <select id="currency" name="currency" className="sel" defaultValue="AED">
              {['AED', 'KWD', 'SAR', 'QAR', 'BHD', 'OMR'].map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="fld">
          <label htmlFor="venue">Venue<span className="opt">optional</span></label>
          <input id="venue" name="venue" className="inp" placeholder="e.g. The Regency, Kuwait City" />
        </div>
      </section>
      <button className="btn primary" disabled={pending}>{pending ? 'Creating…' : 'Create event'}</button>
      <p className="mt-3 text-[12.5px] text-muted">Registration starts switched off, so nobody can sign up before you’re ready.</p>
    </form>
  );
}
