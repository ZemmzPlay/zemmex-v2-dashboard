'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import type { SettingsState } from './actions';
import { keepValues } from '@/lib/use-keep-values';

interface Values { name: string; shortName: string; organiserName: string }

export function DetailsForm({ action, initial, canEdit, links }: {
  action: (p: SettingsState, fd: FormData) => Promise<SettingsState>;
  initial: Values;
  canEdit: boolean;
  /** Where the rest of the event's details live now. */
  links: { website: string; certificates?: string; certNav?: string };
}) {
  const [state, formAction, pending] = useActionState(action, {});

  const text = (name: keyof Values, label: string, opts: { max?: number; optional?: boolean } = {}) => (
    <div className="fld">
      <label htmlFor={name}>{label}{opts.optional && <span className="opt">optional</span>}</label>
      <input id={name} name={name} className="inp" defaultValue={initial[name]} maxLength={opts.max} disabled={!canEdit} />
    </div>
  );

  return (
    <form action={formAction} onSubmit={keepValues(formAction)} className="max-w-[760px]">
      {state.error && <div className="notice err mb-4" role="alert">{state.error}</div>}
      {state.ok && <div className="notice ok mb-4" role="status">{state.ok}</div>}
      <fieldset disabled={!canEdit} className="m-0 border-0 p-0">
        <section className="fsec">
          <h2>Event</h2>
          <p className="hint">Shown on the website, badges and emails.</p>
          <div className="grid gap-x-4 sm:grid-cols-[1fr_120px]">
            {text('name', 'Event name', { max: 120 })}
            {text('shortName', 'Short name', { max: 4 })}
          </div>
          {text('organiserName', 'Organiser', { optional: true, max: 120 })}
          <p className="m-0 text-[12.5px] text-muted">
            The homepage introduction, venue and colour are in <Link href={links.website}>Website</Link>.
            {links.certificates && <> How CME points are earned is in <Link href={links.certificates}>{links.certNav}</Link>.</>}
          </p>
        </section>
      </fieldset>
      {canEdit && <button className="btn primary" disabled={pending}>{pending ? 'Saving…' : 'Save changes'}</button>}
    </form>
  );
}
