'use client';

import { useActionState } from 'react';
import type { ActionState } from '@/lib/action-state';
import { keepValues } from '@/lib/use-keep-values';

/** A website form: the error or confirmation above, one submit button below. */
export function SiteForm({ action, submit, pendingLabel, className, children, full = true }: {
  action: (p: ActionState, fd: FormData) => Promise<ActionState>; submit: string; pendingLabel: string; className?: string; children?: React.ReactNode; full?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} onSubmit={keepValues(formAction)} className={className} noValidate>
      {state.error && !pending && <div className="notice err" role="alert">{state.error}</div>}
      {state.ok && !pending && <div className="notice ok" role="status">{state.ok}</div>}
      {children}
      <button className="btn primary" style={full ? { width: '100%' } : undefined} disabled={pending}>{pending ? pendingLabel : submit}</button>
    </form>
  );
}
