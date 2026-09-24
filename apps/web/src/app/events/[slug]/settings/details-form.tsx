'use client';

import { useActionState, useState } from 'react';
import { contrastLevel, contrastRatio, isHexColour, textOn } from '@zemmz/shared';
import type { SettingsState } from './actions';

interface Values {
  name: string; shortName: string; organiserName: string; heroText: string; venueName: string; venueAddress: string; venuePhone: string; accentColour: string;
  creditRule: string; creditThresholdPct: number;
}

export function DetailsForm({ action, initial, medical, canEdit }: { action: (p: SettingsState, fd: FormData) => Promise<SettingsState>; initial: Values; medical: boolean; canEdit: boolean }) {
  const [state, formAction, pending] = useActionState(action, {});
  const [colour, setColour] = useState(initial.accentColour);
  const valid = isHexColour(colour);
  const ink = valid ? textOn(colour) : '#FFFFFF';
  const ratio = valid ? contrastRatio(colour, ink) : 0;
  const level = contrastLevel(ratio);

  const text = (name: keyof Values, label: string, opts: { max?: number; optional?: boolean; wide?: boolean } = {}) => (
    <div className={`fld ${opts.wide ? 'sm:col-span-2' : ''}`}>
      <label htmlFor={name}>{label}{opts.optional && <span className="opt">optional</span>}</label>
      <input id={name} name={name} className="inp" defaultValue={String(initial[name])} maxLength={opts.max} disabled={!canEdit} />
    </div>
  );

  return (
    <form action={formAction} className="max-w-[760px]">
      {state.error && <div className="notice err mb-4" role="alert">{state.error}</div>}
      {state.ok && <div className="notice ok mb-4" role="status">{state.ok}</div>}
      {state.warn && <div className="notice warn mb-4" role="status">{state.warn}</div>}
      <fieldset disabled={!canEdit} className="m-0 border-0 p-0">
        <section className="fsec">
          <h2>Event</h2>
          <p className="hint">Shown on the website, badges and emails.</p>
          <div className="grid gap-x-4 sm:grid-cols-[1fr_120px]">
            {text('name', 'Event name', { max: 120 })}
            {text('shortName', 'Short name', { max: 4 })}
          </div>
          <div className="grid gap-x-4 sm:grid-cols-2">
            {text('organiserName', 'Organiser', { optional: true })}
            {text('heroText', 'One line under the name on the homepage', { optional: true, max: 240 })}
          </div>
        </section>
        <section className="fsec">
          <h2>Venue</h2>
          <div className="grid gap-x-4 sm:grid-cols-2">
            {text('venueName', 'Venue name', { optional: true })}
            {text('venuePhone', 'Venue phone', { optional: true })}
            {text('venueAddress', 'Address', { optional: true, wide: true })}
          </div>
        </section>
        <section className="fsec">
          <h2>Brand colour</h2>
          <p className="hint">Used for the website header, buttons, badges and emails. Button text switches between white and dark automatically.</p>
          <div className="flex flex-wrap items-end gap-4">
            <div className="fld !mb-0">
              <label htmlFor="accentColour">Colour</label>
              <div className="flex gap-2">
                <input type="color" aria-label="Pick a colour" value={valid ? colour : '#000000'} onChange={(e) => setColour(e.target.value.toUpperCase())} className="h-10 w-12 cursor-pointer rounded-lg border border-line-2 bg-surface p-1" />
                <input id="accentColour" name="accentColour" className="inp w-[120px] font-mono uppercase" value={colour} onChange={(e) => setColour(e.target.value)} aria-invalid={!valid || undefined} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="btn" style={{ background: valid ? colour : 'transparent', color: ink }}>Register</span>
              <span className={`badge ${ratio >= 4.5 ? 'b-ok' : ratio >= 3 ? 'b-warn' : 'b-danger'}`}>{valid ? `${ratio.toFixed(1)}:1 · ${level}` : 'Not a colour'}</span>
            </div>
          </div>
        </section>
        {medical && (
          <section className="fsec">
            <h2>CME points</h2>
            <p className="hint">How delegates earn the points set on each session. Changes apply to points not yet issued on a certificate.</p>
            <div className="flex flex-col gap-2 text-[13.5px]">
              <label className="flex items-center gap-2"><input type="radio" name="creditRule" value="duration" defaultChecked={initial.creditRule === 'duration'} /> Time in the room, from scans in and out</label>
              <label className="flex items-center gap-2"><input type="radio" name="creditRule" value="checkin" defaultChecked={initial.creditRule === 'checkin'} /> Checking in to the session is enough</label>
            </div>
            <div className="fld mt-3 max-w-[260px]">
              <label htmlFor="creditThresholdPct">Share of the session in the room</label>
              <div className="flex items-center gap-2"><input id="creditThresholdPct" name="creditThresholdPct" type="number" min={1} max={100} className="inp w-24" defaultValue={initial.creditThresholdPct} /> %</div>
            </div>
          </section>
        )}
      </fieldset>
      {canEdit && <button className="btn primary" disabled={pending || !valid}>{pending ? 'Saving…' : 'Save changes'}</button>}
    </form>
  );
}
