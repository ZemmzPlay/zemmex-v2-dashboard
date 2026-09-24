'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { eventType, formatMoney, siteText, type Locale } from '@zemmz/shared';
import { FieldInput, INPUT_NAME, type FieldDef } from '@/components/person-form';
import type { CheckoutQuote, PublicFormState } from '../../actions';

interface Ticket { id: string; name: string; description: string; priceMinor: number; left: number | null }

/**
 * Three steps, as in the prototype: tickets, details, payment. Everything is
 * one form so the final submit carries all of it; earlier steps are hidden,
 * not unmounted, so nothing typed is lost when going back.
 */
export function CheckoutFlow({
  slug, currency, tickets, initial, fields, quoteAction, orderAction, type, locale,
}: {
  slug: string;
  currency: string;
  tickets: Ticket[];
  initial: Record<string, number>;
  fields: FieldDef[];
  quoteAction: (wanted: Record<string, number>, promo: string) => Promise<CheckoutQuote>;
  orderAction: (p: PublicFormState, fd: FormData) => Promise<PublicFormState>;
  type: string;
  locale: Locale;
}) {
  const TY = eventType(type);
  const tx = siteText(TY, locale);
  const gates = TY.gates;
  const [step, setStep] = useState(0);
  const [qty, setQty] = useState<Record<string, number>>(initial);
  const [promo, setPromo] = useState('');
  const [appliedPromo, setAppliedPromo] = useState('');
  const [q, setQ] = useState<CheckoutQuote | null>(null);
  const [quoting, startQuote] = useTransition();
  const [state, formAction, placing] = useActionState(orderAction, {});
  const count = Object.values(qty).reduce((a, b) => a + b, 0);
  const free = q ? q.totalMinor === 0 : false;

  useEffect(() => {
    startQuote(async () => setQ(await quoteAction(qty, appliedPromo)));
  }, [qty, appliedPromo, quoteAction]);

  // A server error sends the buyer back to the step that can fix it.
  useEffect(() => {
    if (state.fieldErrors) setStep(1);
  }, [state]);

  const holders: { i: number; ticket: string }[] = [];
  let i = 0;
  for (const t of tickets) for (let k = 0; k < (qty[t.id] ?? 0); k++) holders.push({ i: i++, ticket: t.name });

  const steps = tx.steps(free);
  const money = (n: number) => formatMoney(n, currency);

  return (
    <form
      action={formAction}
      noValidate
      className="mt-6"
      onSubmit={(e) => {
        // Enter in a field must never pay: before the last step it moves forward
        // (or applies the promo code) instead of triggering the Pay button.
        if (step === 2) return;
        e.preventDefault();
        if (document.activeElement?.id === 'promo') setAppliedPromo(promo.trim());
        else if (count && !quoting) setStep(step + 1);
      }}
    >
      <input type="hidden" name="wanted" value={JSON.stringify(qty)} />
      <input type="hidden" name="promo" value={appliedPromo} />
      <ol className="steps3" aria-label="Checkout steps">
        {steps.map((s, n) => <li key={s} aria-current={n === step ? 'step' : undefined} className={n < step ? 'done' : ''}>{n + 1}. {s}</li>)}
      </ol>
      {state.error && <div className="note err" role="alert">{state.error}</div>}

      {/* 1. Tickets */}
      <fieldset hidden={step !== 0} className="m-0 border-0 p-0">
        <legend className="sr-only">{steps[0]}</legend>
        {tickets.map((t) => {
          const max = Math.min(10, t.left ?? 10);
          const n = qty[t.id] ?? 0;
          return (
            <div className={`tk ${t.left === 0 ? 'off' : ''}`} key={t.id}>
              <div><b>{t.name}</b><small>{t.description}</small></div>
              <div className="pr">{t.left === 0 ? tx.soldOut : formatMoney(t.priceMinor, currency, { freeLabel: true })}</div>
              {t.left !== 0 && (
                <div className="qty" role="group" aria-label={tx.ticketsOf(t.name)}>
                  <button type="button" onClick={() => setQty({ ...qty, [t.id]: Math.max(0, n - 1) })} disabled={n === 0} aria-label={tx.oneFewer(t.name)}>−</button>
                  <output aria-live="polite">{n}</output>
                  <button type="button" onClick={() => setQty({ ...qty, [t.id]: Math.min(max, n + 1) })} disabled={n >= max} aria-label={tx.oneMore(t.name)}>+</button>
                </div>
              )}
            </div>
          );
        })}
        <div className="fld mt-4 max-w-[360px]">
          <label htmlFor="promo">{tx.promo}<span className="opt">{tx.optional}</span></label>
          <div className="flex gap-2">
            <input id="promo" className="inp uppercase" value={promo} onChange={(e) => setPromo(e.target.value)} autoComplete="off" />
            <button type="button" className="btn line sm !h-11" onClick={() => setAppliedPromo(promo.trim())}>{tx.apply}</button>
          </div>
          {q?.error && appliedPromo && <span className="err" role="alert">{q.error}</span>}
          {q?.promo && <span className="text-[12.5px] font-semibold text-[var(--ok)]">{tx.percentOff(q.promo.code, q.promo.percentOff)}</span>}
        </div>
        <Summary q={q} money={money} busy={quoting} tx={tx} />
        <button type="button" className="btn accent mt-4" disabled={!count || quoting || !!(q?.error && appliedPromo)} onClick={() => setStep(1)}>{tx.continue}</button>
      </fieldset>

      {/* 2. Details */}
      <fieldset hidden={step !== 1} className="m-0 border-0 p-0">
        <legend className="sr-only">{tx.yourDetails}</legend>
        <h2 className="mb-3 text-[18px] font-bold">{tx.yourDetails}</h2>
        <div className="grid gap-x-3 sm:grid-cols-2">
          {fields.map((f) => (
            <FieldInput key={f.key} f={f} namePrefix="b_" value={state.values?.[`b_${INPUT_NAME[f.key] ?? `a_${f.key}`}`] ?? ''} error={state.fieldErrors?.[f.key]} text={tx} />
          ))}
        </div>
        {holders.length > 1 && (
          <>
            <h2 className="mb-1 mt-4 text-[18px] font-bold">{tx.nameOnEach}</h2>
            <p className="mt-0 text-[13.5px] text-[var(--muted)]">{tx.nameOnEachSub(gates)}</p>
            {holders.map((h) => (
              <div className="grid items-end gap-x-3 sm:grid-cols-[140px_1fr_1fr]" key={h.i}>
                <div className="pb-5 text-[13px] font-semibold">{h.i + 1}. {h.ticket}</div>
                <div className="fld"><label htmlFor={`h${h.i}f`}>{tx.firstName}</label><input id={`h${h.i}f`} name={`h${h.i}_first`} className="inp" defaultValue={state.values?.[`h${h.i}_first`]} /></div>
                <div className="fld"><label htmlFor={`h${h.i}l`}>{tx.lastName}</label><input id={`h${h.i}l`} name={`h${h.i}_last`} className="inp" defaultValue={state.values?.[`h${h.i}_last`]} /></div>
              </div>
            ))}
          </>
        )}
        <label className="mb-3 flex items-start gap-2 text-[13px] text-[var(--ink-2)]"><input type="checkbox" name="b_consent" className="mt-1" /> {tx.consentShort}</label>
        <div className="flex gap-2">
          <button type="button" className="btn line" onClick={() => setStep(0)}>{tx.back}</button>
          <button type="button" className="btn accent" onClick={() => setStep(2)}>{tx.continue}</button>
        </div>
      </fieldset>

      {/* 3. Payment */}
      <fieldset hidden={step !== 2} className="m-0 border-0 p-0">
        <legend className="sr-only">{steps[2]}</legend>
        <Summary q={q} money={money} busy={quoting} tx={tx} />
        {free ? (
          <button className="btn accent block mt-4" name="pay" value="approve" disabled={placing}>{placing ? tx.confirming : tx.confirm}</button>
        ) : (
          <>
            <div className="note warn mt-4">
              <b>{tx.testPayments}</b> {tx.testPaymentsBody}
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <button className="btn accent" name="pay" value="approve" disabled={placing || !q}>{placing ? tx.paying : tx.pay(q ? money(q.totalMinor) : '')}</button>
              <button className="btn line" name="pay" value="applepay" disabled={placing || !q} style={{ background: '#000', color: '#fff', borderColor: '#000' }}>{tx.applePay}</button>
            </div>
            <button className="mt-3 border-0 bg-transparent p-0 text-[13px] font-semibold text-[var(--muted)] underline" name="pay" value="decline" disabled={placing}>{tx.tryDecline}</button>
          </>
        )}
        <div className="mt-4"><button type="button" className="btn line sm" onClick={() => setStep(1)}>{tx.back}</button></div>
        <p className="fine">{tx.emailedFine}</p>
      </fieldset>
      <p className="sr-only" aria-live="polite">{tx.stepOf(step + 1, steps[step])}</p>
      <input type="hidden" name="slug" value={slug} />
    </form>
  );
}

function Summary({ q, money, busy, tx }: { q: CheckoutQuote | null; money: (n: number) => string; busy: boolean; tx: ReturnType<typeof siteText> }) {
  if (!q || !q.lines.length) return <p className="mt-4 text-[var(--muted)]">{busy ? tx.workingOut : tx.chooseOneTicket}</p>;
  return (
    <div className="mt-4 rounded-xl border border-[var(--line)] p-4" aria-busy={busy}>
      {q.lines.map((l) => <div className="sumrow" key={l.ticketTypeId}><span>{l.qty} × {l.name}</span><span>{money(l.unitMinor * l.qty)}</span></div>)}
      {q.discountMinor > 0 && <div className="sumrow"><span>{tx.discount(q.promo?.code ?? '')}</span><span>−{money(q.discountMinor)}</span></div>}
      {q.feeMinor > 0 && <div className="sumrow"><span>{tx.bookingFee}</span><span>{money(q.feeMinor)}</span></div>}
      <div className="sumrow tot"><span>{tx.total}</span><span>{money(q.totalMinor)}</span></div>
    </div>
  );
}
