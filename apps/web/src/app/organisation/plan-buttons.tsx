'use client';

import { useActionState } from 'react';
import type { Plan } from '@zemmz/db';
import type { ActionState } from '@/lib/action-state';

/** Pay by card (to the provider's page) or ask for an invoice, for one plan. */
export function PlanButtons({ plan, cards, payLabel, buy, invoice }: {
  plan: Plan;
  cards: boolean;
  payLabel: string;
  buy: (p: ActionState, fd: FormData) => Promise<ActionState>;
  invoice: (p: ActionState, fd: FormData) => Promise<ActionState>;
}) {
  const [bought, buyAction, buying] = useActionState(buy, {});
  const [asked, askAction, asking] = useActionState(invoice, {});
  return (
    <div className="flex flex-col items-start gap-1.5">
      {cards && (
        <form action={buyAction}>
          <input type="hidden" name="plan" value={plan} />
          <button className="btn primary sm" disabled={buying}>{buying ? 'Opening the payment page…' : payLabel}</button>
        </form>
      )}
      {asked.ok ? (
        <span className="text-[12.5px] text-ok" role="status">{asked.ok}</span>
      ) : (
        <form action={askAction}>
          <input type="hidden" name="plan" value={plan} />
          <button className={cards ? 'border-0 bg-transparent p-0 text-[12.5px] font-semibold text-brand underline' : 'btn secondary sm'} disabled={asking}>{asking ? 'Sending…' : 'Ask for an invoice'}</button>
        </form>
      )}
      {(bought.error || asked.error) && <span className="text-[12.5px] text-danger" role="alert">{bought.error || asked.error}</span>}
    </div>
  );
}
