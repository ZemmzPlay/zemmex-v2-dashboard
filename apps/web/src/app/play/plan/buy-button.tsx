'use client';

import { useActionState } from 'react';
import type { ActionState } from '@/lib/action-state';

export function BuyButton({ action, plan, months, label, primary }: { action: (p: ActionState, fd: FormData) => Promise<ActionState>; plan: string; months: number; label: string; primary?: boolean }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction}>
      <input type="hidden" name="plan" value={plan} />
      <input type="hidden" name="months" value={months} />
      <button className={`btn ${primary ? 'primary' : 'secondary'} w-full`} disabled={pending}>{pending ? 'Opening checkout…' : label}</button>
      {state.error && <p className="m-0 mt-1.5 text-[12.5px] text-danger" role="alert">{state.error}</p>}
    </form>
  );
}
