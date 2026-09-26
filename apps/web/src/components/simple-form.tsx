'use client';

import { useActionState } from 'react';
import type { ActionState } from '@/lib/action-state';
import { keepValues } from '@/lib/use-keep-values';

/** A form with a save button and the result above it. */
export function SimpleForm({ action, submitLabel, canEdit, children, id }: { action: (p: ActionState, fd: FormData) => Promise<ActionState>; submitLabel: string; canEdit: boolean; children: React.ReactNode; /** Lets inputs elsewhere on the page join the form with form="…". */ id?: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form id={id} action={formAction} onSubmit={keepValues(formAction)} className="max-w-[760px]">
      {state.error && <div className="notice err mb-4" role="alert">{state.error}</div>}
      {state.ok && !pending && <div className="notice ok mb-4" role="status">{state.ok}</div>}
      <fieldset disabled={!canEdit} className="m-0 border-0 p-0">{children}</fieldset>
      {canEdit && <button className="btn primary" disabled={pending}>{pending ? 'Saving…' : submitLabel}</button>}
    </form>
  );
}
