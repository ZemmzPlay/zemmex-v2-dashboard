'use client';

import { useActionState, useState } from 'react';
import type { ActionState } from '@/lib/action-state';
import { Icon } from '@/components/icon';

/**
 * The score the admin confirms. The line under it says who goes through, so a
 * swapped score is caught before it moves the bracket.
 */
export function ResultForm({ action, a, b, initial, knockout, submitLabel = 'Confirm result', note = false }: {
  action: (p: ActionState, fd: FormData) => Promise<ActionState>;
  a: string;
  b: string;
  initial: [number | null, number | null];
  /** Losing ends the loser's run (elimination), rather than costing points. */
  knockout: boolean;
  submitLabel?: string;
  note?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [sa, setA] = useState(initial[0] == null ? '' : String(initial[0]));
  const [sb, setB] = useState(initial[1] == null ? '' : String(initial[1]));
  const x = Number(sa), y = Number(sb);
  const filled = sa !== '' && sb !== '' && Number.isInteger(x) && Number.isInteger(y);
  const level = filled && x === y;
  const winner = x > y ? a : b, loser = x > y ? b : a;
  return (
    <form action={formAction}>
      {state.error && <div className="notice err mb-3" role="alert">{state.error}</div>}
      {state.ok && !pending && <div className="notice ok mb-3" role="status">{state.ok}</div>}
      <div className="vs-row">
        <div className="fld !mb-0"><label htmlFor="r-a">{a}</label><input id="r-a" name="scoreA" className="inp" type="number" min={0} max={999} required value={sa} onChange={(e) => setA(e.target.value)} /></div>
        <span className="pb-4 text-[22px] text-muted" aria-hidden>–</span>
        <div className="fld !mb-0"><label htmlFor="r-b">{b}</label><input id="r-b" name="scoreB" className="inp" type="number" min={0} max={999} required value={sb} onChange={(e) => setB(e.target.value)} /></div>
      </div>
      <p className="mt-3 mb-0 text-[13px]" aria-live="polite">
        {!filled ? <span className="text-muted">Enter both scores.</span>
          : level ? <span className="text-warn"><Icon name="alert" size={15} className="mr-1.5 inline align-[-3px]" /> Scores are level. Enter the deciding result: matches can’t end in a draw.</span>
          : <span className="text-ok"><Icon name="trophy" size={15} className="mr-1.5 inline align-[-3px]" /> <b>{winner}</b> wins {Math.max(x, y)}–{Math.min(x, y)}{knockout ? ` and goes through. ${loser} is out of this bracket.` : '.'}</span>}
      </p>
      {note && <div className="fld mt-3 !mb-0"><label htmlFor="r-note">Note<span className="opt">optional</span></label><input id="r-note" name="note" className="inp" maxLength={200} placeholder="For example, confirmed by both captains on Discord" /></div>}
      <button className="btn primary mt-4" disabled={pending || !filled || level}><Icon name="check" size={16} /> {pending ? 'Saving…' : submitLabel}</button>
    </form>
  );
}
