'use client';

import { useRef } from 'react';
import { useFormStatus } from 'react-dom';

/**
 * A destructive action is always confirmed by a dialog that names the
 * consequence, and the confirm button repeats the action's name (docs/04).
 */
export function ConfirmButton({
  action,
  label,
  title,
  body,
  confirmLabel,
  className = 'btn danger-ghost',
  hidden,
}: {
  action: (fd: FormData) => void | Promise<void>;
  label: React.ReactNode;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  className?: string;
  hidden?: Record<string, string>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={className} onClick={() => ref.current?.showModal()}>
        {label}
      </button>
      <dialog ref={ref} className="modal" aria-labelledby="cd-title">
        <form action={action} onSubmit={() => setTimeout(() => ref.current?.close(), 0)}>
          {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <div className="modal-h"><h2 id="cd-title">{title}</h2></div>
          <div className="modal-b text-ink-2">{body}</div>
          <div className="modal-f">
            <button type="button" className="btn secondary" onClick={() => ref.current?.close()} autoFocus>Keep it</button>
            <Submit label={confirmLabel} />
          </div>
        </form>
      </dialog>
    </>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button className="btn danger" disabled={pending}>{pending ? 'Working…' : label}</button>;
}

export function SubmitButton({ children, className = 'btn primary', pendingLabel = 'Saving…' }: { children: React.ReactNode; className?: string; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return <button className={className} disabled={pending}>{pending ? pendingLabel : children}</button>;
}
