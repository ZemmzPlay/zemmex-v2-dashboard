'use client';

import { useActionState, useState } from 'react';
import { contrastLevel, contrastRatio, isHexColour, textOn } from '@zemmz/shared';
import type { ThemeState } from './actions';
import { keepValues } from '@/lib/use-keep-values';

/** The event colour, with the button text contrast shown as it changes. */
export function ThemeForm({ action, initial, canEdit }: { action: (p: ThemeState, fd: FormData) => Promise<ThemeState>; initial: string; canEdit: boolean }) {
  const [state, formAction, pending] = useActionState(action, {});
  const [colour, setColour] = useState(initial);
  const valid = isHexColour(colour);
  const ink = valid ? textOn(colour) : '#FFFFFF';
  const ratio = valid ? contrastRatio(colour, ink) : 0;
  const dark = ink !== '#FFFFFF';

  return (
    <form action={formAction} onSubmit={keepValues(formAction)} className="max-w-[760px]">
      {state.error && <div className="notice err mb-4" role="alert">{state.error}</div>}
      {state.ok && !pending && <div className="notice ok mb-4" role="status">{state.ok}</div>}
      {state.warn && !pending && <div className="notice warn mb-4" role="status">{state.warn}</div>}
      <section className="fsec">
        <h2>Event colour</h2>
        <p className="hint">Used for the website header, buttons, badges and emails. Button text switches between white and dark automatically.</p>
        <fieldset disabled={!canEdit} className="m-0 flex flex-wrap items-end gap-4 border-0 p-0">
          <div className="fld !mb-0">
            <label htmlFor="accentColour">Colour</label>
            <div className="flex gap-2">
              <input type="color" aria-label="Pick a colour" value={valid ? colour : '#000000'} onChange={(e) => setColour(e.target.value.toUpperCase())} className="h-10 w-12 cursor-pointer rounded-lg border border-line-2 bg-surface p-1" />
              <input id="accentColour" name="accentColour" className="inp w-[120px] font-mono uppercase" value={colour} onChange={(e) => setColour(e.target.value)} maxLength={7} aria-invalid={!valid || undefined} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="btn" style={{ background: valid ? colour : 'transparent', color: ink }}>Register</span>
            <span className={`badge ${ratio >= 4.5 ? 'b-ok' : ratio >= 3 ? 'b-warn' : 'b-danger'}`}>{valid ? `${ratio.toFixed(1)}:1 · ${contrastLevel(ratio)}` : 'Not a colour'}</span>
          </div>
        </fieldset>
        {valid && (
          <p className="mb-0 mt-3.5 text-[12.5px] text-muted">
            {dark ? `This colour is light, so button text switches to dark (${ratio.toFixed(1)}:1) to stay readable.` : `Buttons use white text (${ratio.toFixed(1)}:1).`} Links on the website are adjusted separately until they reach 4.5:1.
          </p>
        )}
      </section>
      {canEdit && <button className="btn primary" disabled={pending || !valid}>{pending ? 'Saving…' : 'Save colour'}</button>}
    </form>
  );
}
