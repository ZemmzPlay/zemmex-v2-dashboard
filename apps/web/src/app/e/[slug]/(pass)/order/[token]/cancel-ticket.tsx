'use client';

import { useActionState, useState } from 'react';
import type { PublicFormState } from '../../../actions';

/** Two-step cancel on the buyer's order page: the second step names the refund. */
export function CancelTicket({ action, label, confirm, keep }: { action: (p: PublicFormState) => Promise<PublicFormState>; label: string; confirm: string; keep: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, {});
  if (state.info) return <p className="no-print mt-2 text-center text-[13px] font-semibold text-[var(--ok)]" role="status">{state.info}</p>;
  return (
    <div className="no-print mt-2 text-center text-[13px]">
      {state.error && <p className="m-0 mb-2 text-[var(--danger)]" role="alert">{state.error}</p>}
      {open ? (
        <form action={formAction} className="rounded-xl border border-[var(--line)] p-3">
          <p className="m-0 mb-2">{confirm}</p>
          <div className="flex justify-center gap-2">
            <button className="btn sm" style={{ background: 'var(--danger)', color: '#fff' }} disabled={pending}>{label}</button>
            <button type="button" className="btn line sm" onClick={() => setOpen(false)}>{keep}</button>
          </div>
        </form>
      ) : (
        <button type="button" className="border-0 bg-transparent p-0 font-semibold text-[var(--muted)] underline" onClick={() => setOpen(true)}>{label}</button>
      )}
    </div>
  );
}
