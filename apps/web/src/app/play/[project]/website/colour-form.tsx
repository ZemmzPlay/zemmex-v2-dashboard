'use client';

import { useActionState, useState } from 'react';
import { contrastLevel, contrastRatio, fixContrast, isHexColour, textOn } from '@zemmz/shared';
import { keepValues } from '@/lib/use-keep-values';
import type { ThemeState } from './actions';

/** The website colour, with button text and link contrast shown as it changes. */
export function ColourForm({ action, initial, canEdit }: { action: (p: ThemeState, fd: FormData) => Promise<ThemeState>; initial: string; canEdit: boolean }) {
  const [state, formAction, pending] = useActionState(action, {});
  const [colour, setColour] = useState(initial);
  const valid = isHexColour(colour);
  const ink = valid ? textOn(colour) : '#FFFFFF';
  const ratio = valid ? contrastRatio(colour, ink) : 0;
  // The website is dark; links use the colour lightened until they read on it.
  const link = valid ? fixContrast(colour, '#0B0714') : '#FFFFFF';
  return (
    <form action={formAction} onSubmit={keepValues(formAction)}>
      {state.error && <div className="notice err mb-4" role="alert">{state.error}</div>}
      {state.ok && !pending && <div className="notice ok mb-4" role="status">{state.ok}</div>}
      {state.warn && !pending && <div className="notice warn mb-4" role="status">{state.warn}</div>}
      <fieldset disabled={!canEdit} className="m-0 flex flex-wrap items-end gap-4 border-0 p-0">
        <div className="fld !mb-0">
          <label htmlFor="accentColour">Colour</label>
          <div className="flex gap-2">
            <input type="color" aria-label="Pick a colour" value={valid ? colour : '#000000'} onChange={(e) => setColour(e.target.value.toUpperCase())} className="h-10 w-12 cursor-pointer rounded-lg border border-line-2 bg-surface p-1" />
            <input id="accentColour" name="accentColour" className="inp w-[120px] font-mono uppercase" value={colour} onChange={(e) => setColour(e.target.value)} maxLength={7} aria-invalid={!valid || undefined} />
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-[#0B0714] px-4 py-2.5">
          <span className="btn sm" style={{ background: valid ? colour : 'transparent', color: ink }}>Register</span>
          <span className="text-[13px] font-semibold underline" style={{ color: link }}>View bracket</span>
        </div>
        <span className={`badge ${ratio >= 4.5 ? 'b-ok' : ratio >= 3 ? 'b-warn' : 'b-danger'}`}>{valid ? `${ratio.toFixed(1)}:1 · ${contrastLevel(ratio)}` : 'Not a colour'}</span>
      </fieldset>
      {valid && <p className="mb-0 mt-3.5 text-[12.5px] text-muted">Button text is {ink === '#FFFFFF' ? 'white' : 'dark'} ({ratio.toFixed(1)}:1).{link.toUpperCase() !== colour.toUpperCase() ? ` Links are lightened to ${link.toUpperCase()} so they reach 4.5:1 on the dark website.` : ''}</p>}
      {canEdit && <button className="btn primary mt-4" disabled={pending || !valid}>{pending ? 'Saving…' : 'Save colour'}</button>}
    </form>
  );
}
