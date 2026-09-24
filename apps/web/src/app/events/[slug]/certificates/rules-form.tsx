'use client';

import { useActionState, useState } from 'react';
import type { ActionState } from '@/lib/action-state';
import { keepValues } from '@/lib/use-keep-values';

const PCTS = [50, 66, 75, 90, 100];

/** How CME points are earned (medical), or the minimum sessions (others), and whether the evaluation comes first. */
export function RulesForm({ action, cme, initial, evalNav, unit, units, canEdit }: {
  action: (p: ActionState, fd: FormData) => Promise<ActionState>;
  cme: boolean;
  initial: { creditRule: 'duration' | 'checkin'; creditThresholdPct: number; minSessions: number; requireEvaluation: boolean };
  evalNav: string;
  unit: string;
  units: string;
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [rule, setRule] = useState(initial.creditRule);
  const pcts = PCTS.includes(initial.creditThresholdPct) ? PCTS : [...PCTS, initial.creditThresholdPct].sort((a, b) => a - b);

  return (
    <form action={formAction} onSubmit={keepValues(formAction)}>
      {state.error && <div className="notice err mb-4" role="alert">{state.error}</div>}
      {state.ok && !pending && <div className="notice ok mb-4" role="status">{state.ok}</div>}
      <fieldset disabled={!canEdit} className="m-0 border-0 p-0">
        {cme && (
          <section className="fsec">
            <h2>How CME points are earned</h2>
            <p className="hint">Applies to every {unit}. Changing this recalculates points not yet on a certificate.</p>
            <div className="opt-cards !grid-cols-2">
              <label className="opt-card">
                <input type="radio" name="creditRule" value="duration" className="sr-only" checked={rule === 'duration'} onChange={() => setRule('duration')} />
                <b>Time in the room</b><small>Points if they stay long enough. Needs scanning out.</small>
              </label>
              <label className="opt-card">
                <input type="radio" name="creditRule" value="checkin" className="sr-only" checked={rule === 'checkin'} onChange={() => setRule('checkin')} />
                <b>Checking in</b><small>Full points as soon as they scan in.</small>
              </label>
            </div>
            {rule === 'duration' ? (
              <div className="fld !mb-0 mt-3.5 max-w-[280px]">
                <label htmlFor="cr-pct">Minimum time in a {unit}</label>
                <select id="cr-pct" name="creditThresholdPct" className="sel" defaultValue={initial.creditThresholdPct}>
                  {pcts.map((p) => <option key={p} value={p}>{p}% of the {unit}</option>)}
                </select>
                <span className="help">If someone forgets to scan out, they’re counted until the {unit} ends.</span>
              </div>
            ) : <input type="hidden" name="creditThresholdPct" value={initial.creditThresholdPct} />}
          </section>
        )}
        <section className="fsec">
          <h2>Who can claim a certificate</h2>
          <div className="mt-2.5 flex flex-col gap-3">
            {cme ? (
              <label className="switch"><input type="checkbox" checked disabled /> Must have checked in to at least one {unit} <span className="tag">Always on</span></label>
            ) : (
              <div className="fld !mb-0 max-w-[300px]">
                <label htmlFor="cr-min">Must have checked in to at least</label>
                <select id="cr-min" name="minSessions" className="sel" defaultValue={initial.minSessions}>
                  {[...new Set([1, 2, 3, 4, 5, initial.minSessions])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n} {n === 1 ? unit : units}</option>)}
                </select>
              </div>
            )}
            <label className="switch"><input type="checkbox" name="requireEvaluation" defaultChecked={initial.requireEvaluation} /> Must complete the {evalNav.toLowerCase()} form first</label>
          </div>
        </section>
      </fieldset>
      {canEdit && <button className="btn secondary" disabled={pending}>{pending ? 'Saving…' : 'Save rules'}</button>}
    </form>
  );
}
