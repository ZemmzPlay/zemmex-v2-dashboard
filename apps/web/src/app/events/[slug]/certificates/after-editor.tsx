'use client';

import { useActionState, useState } from 'react';
import { textOn } from '@zemmz/shared';
import { Icon, type IconName } from '@/components/icon';
import type { ActionState } from '@/lib/action-state';

interface Values { showRecordings: boolean; showSlides: boolean; showPhotos: boolean; showSurvey: boolean; attendeesOnly: boolean; message: string }

/** What the after-event page shows, who can open it, and a preview. */
export function AfterEditor({ action, initial, gates, unit, idName, eventName, dates, accent, canEdit }: {
  action: (p: ActionState, fd: FormData) => Promise<ActionState>;
  initial: Values;
  gates: boolean;
  unit: string;
  idName: string;
  eventName: string;
  dates: string;
  accent: string;
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [v, setV] = useState(initial);
  const items: [keyof Values, IconName, string, string][] = gates
    ? [['showPhotos', 'star', 'Photo gallery', 'Official photos from the night'], ['showSurvey', 'form', 'Post-show survey', 'A few quick questions']]
    : [['showRecordings', 'sparkle', 'Recordings', `Every main-stage ${unit}`], ['showSlides', 'download', 'Slides', 'Speakers’ decks'], ['showPhotos', 'star', 'Photo gallery', 'Official photos'], ['showSurvey', 'form', 'Feedback survey', 'A few quick questions']];
  const tiles = items.filter(([k]) => v[k]);

  return (
    <div className="grid items-start gap-4 xl:grid-cols-2">
      <form action={formAction}>
        {state.error && <div className="notice err mb-4" role="alert">{state.error}</div>}
        {state.ok && !pending && <div className="notice ok mb-4" role="status">{state.ok}</div>}
        <fieldset disabled={!canEdit} className="m-0 border-0 p-0">
          <section className="fsec">
            <h2>What to show</h2>
            <div>
              {items.map(([k, icon, label, desc]) => (
                <div className="qs-row" key={k}>
                  <span className="text-muted"><Icon name={icon} size={20} /></span>
                  <div><b id={`af-${k}`}>{label}</b><small>{desc}</small></div>
                  <label className="switch">
                    <input type="checkbox" role="switch" name={k} aria-labelledby={`af-${k}`} checked={!!v[k]} onChange={(e) => setV({ ...v, [k]: e.target.checked })} />
                  </label>
                </div>
              ))}
            </div>
            {(v.showRecordings || v.showSlides || v.showPhotos) && <p className="mb-0 mt-2 text-[12.5px] text-muted">Until file uploads are added, these show as “to be uploaded”.</p>}
          </section>
          <section className="fsec">
            <h2>Who can see it</h2>
            <div className="opt-cards !grid-cols-2">
              <label className="opt-card">
                <input type="radio" name="attendeesOnly" value="1" className="sr-only" checked={v.attendeesOnly} onChange={() => setV({ ...v, attendeesOnly: true })} />
                <b>Only people who came</b><small>They enter their {idName.charAt(0).toLowerCase() + idName.slice(1)}. No-shows are turned away.</small>
              </label>
              <label className="opt-card">
                <input type="radio" name="attendeesOnly" value="0" className="sr-only" checked={!v.attendeesOnly} onChange={() => setV({ ...v, attendeesOnly: false })} />
                <b>Everyone who registered</b><small>They still enter their ID and email, but don’t need to have come.</small>
              </label>
            </div>
          </section>
          <section className="fsec">
            <h2><label htmlFor="af-msg">Message</label></h2>
            <p className="hint">Shown at the top of the page.</p>
            <textarea id="af-msg" name="message" className="inp w-full" maxLength={1000} value={v.message} onChange={(e) => setV({ ...v, message: e.target.value })} />
          </section>
        </fieldset>
        {canEdit && <button className="btn primary" disabled={pending}>{pending ? 'Saving…' : 'Save'}</button>}
      </form>
      <div className="xl:sticky xl:top-[84px]">
        <div className="mb-2 text-[13px] font-medium">Preview</div>
        <div className="card overflow-hidden" aria-hidden="true">
          <div className="p-5" style={{ background: accent, color: textOn(accent) }}>
            <b className="text-[18px]">{eventName}</b>
            <div className="text-[12.5px] opacity-80">{dates}</div>
          </div>
          <div className="card-b">
            <p className="m-0 mb-3 whitespace-pre-line text-[13.5px]">{v.message || <span className="text-muted">No message.</span>}</p>
            <div className="mb-3.5 flex gap-2">
              <span className="inp flex flex-1 items-center text-muted">{idName}</span>
              <span className="btn sm" style={{ background: accent, color: textOn(accent) }}>{v.attendeesOnly ? 'Unlock' : 'Open'}</span>
            </div>
            {tiles.length ? (
              <div className="grid grid-cols-2 gap-2">
                {tiles.map(([k, icon, label]) => (
                  <div key={k} className="flex items-center gap-2.5 rounded-[10px] border border-line p-3">
                    <Icon name={icon} size={20} />
                    <b className="text-[13px]">{label}</b>
                  </div>
                ))}
              </div>
            ) : <p className="m-0 text-muted">Nothing selected.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
