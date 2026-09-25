'use client';

import { useActionState } from 'react';
import { keepValues } from '@/lib/use-keep-values';
import type { AuthFormState } from './account-actions';

/** A card form with the result above it and one full-width button. */
export function AuthForm({ action, submitLabel, children, hideOnSuccess }: { action: (p: AuthFormState, fd: FormData) => Promise<AuthFormState>; submitLabel: string; children: React.ReactNode; hideOnSuccess?: boolean }) {
  const [state, formAction, pending] = useActionState(action, {});
  if (hideOnSuccess && state.ok) return <div className="notice ok" role="status">{state.ok}</div>;
  return (
    <form action={formAction} onSubmit={keepValues(formAction)} noValidate>
      {state.error && <div className="notice err" role="alert">{state.error}</div>}
      {state.ok && <div className="notice ok" role="status">{state.ok}</div>}
      {children}
      <button className="btn primary full" disabled={pending}>{pending ? 'Working…' : submitLabel}</button>
    </form>
  );
}
