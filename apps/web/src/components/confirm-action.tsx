'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import type { ActionState } from '@/lib/action-state';

/**
 * ConfirmButton for actions that can fail with a reason (a refund the provider
 * refuses): the dialog names the consequence, stays open with the error, and
 * closes on success, leaving the result next to the button.
 */
export function ConfirmAction({
  action, label, title, body, confirmLabel, className = 'btn danger-ghost', danger = true,
}: {
  action: (p: ActionState, fd: FormData) => Promise<ActionState>;
  label: React.ReactNode;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  className?: string;
  danger?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState(action, {});
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (state.at) ref.current?.close();
  }, [state.at]);
  return (
    <>
      <button type="button" className={className} onClick={() => { setTried(false); ref.current?.showModal(); }}>{label}</button>
      {state.ok && <span className="text-[12.5px] text-ok" role="status">{state.ok}</span>}
      <dialog ref={ref} className="modal" aria-label={title}>
        <form action={formAction} onSubmit={() => setTried(true)}>
          <div className="modal-h"><h2>{title}</h2></div>
          <div className="modal-b text-ink-2">
            {tried && state.error && !pending && <div className="notice err mb-4" role="alert">{state.error}</div>}
            {body}
          </div>
          <div className="modal-f">
            <button type="button" className="btn secondary" onClick={() => ref.current?.close()} autoFocus>Keep it</button>
            <button className={danger ? 'btn danger' : 'btn primary'} disabled={pending}>{pending ? 'Working…' : confirmLabel}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
