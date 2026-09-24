'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import type { ActionState } from '@/lib/action-state';
import { keepValues } from '@/lib/use-keep-values';

/**
 * A button that opens a dialog holding a form. The dialog closes when the
 * action succeeds and stays open with the error when it doesn't.
 */
export function FormDialog({
  action,
  label,
  title,
  submitLabel,
  children,
  className = 'btn secondary',
  wide,
}: {
  action: (p: ActionState, fd: FormData) => Promise<ActionState>;
  label: React.ReactNode;
  title: string;
  submitLabel: string;
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // A new key on every open resets the form to the saved values.
  const [key, setKey] = useState(0);
  const [fresh, setFresh] = useState(true);
  const [state, formAction, pending] = useActionState(action, {});
  useEffect(() => {
    if (state.at) ref.current?.close();
  }, [state.at]);

  return (
    <>
      <button type="button" className={className} onClick={() => { setKey((k) => k + 1); setFresh(true); ref.current?.showModal(); }}>
        {label}
      </button>
      <dialog ref={ref} className={`modal ${wide ? '!w-[min(720px,calc(100%-32px))]' : ''}`} aria-label={title}>
        <form key={key} action={formAction} onSubmit={(e) => { setFresh(false); keepValues(formAction)(e); }}>
          <div className="modal-h"><h2>{title}</h2></div>
          <div className="modal-b text-left">
            {state.error && !fresh && !pending && <div className="notice err mb-4" role="alert">{state.error}</div>}
            {children}
          </div>
          <div className="modal-f">
            <button type="button" className="btn secondary" onClick={() => ref.current?.close()}>Cancel</button>
            <button className="btn primary" disabled={pending}>{pending ? 'Saving…' : submitLabel}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
