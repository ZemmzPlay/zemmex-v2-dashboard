'use client';

import { useActionState } from 'react';
import type { ActionState } from '@/lib/action-state';

/** A form with a save button and the result above it. */
export function SimpleForm({ action, submitLabel, canEdit, children }: { action: (p: ActionState, fd: FormData) => Promise<ActionState>; submitLabel: string; canEdit: boolean; children: React.ReactNode }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="max-w-[760px]">
      {state.error && <div className="notice err mb-4" role="alert">{state.error}</div>}
      {state.ok && !pending && <div className="notice ok mb-4" role="status">{state.ok}</div>}
      <fieldset disabled={!canEdit} className="m-0 border-0 p-0">{children}</fieldset>
      {canEdit && <button className="btn primary" disabled={pending}>{pending ? 'Saving…' : submitLabel}</button>}
    </form>
  );
}
