'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useState } from 'react';
import { formatMoney } from '@zemmz/shared';
import { FieldInput, type FieldDef } from '@/components/person-form';
import type { PublicFormState } from '../actions';

export function FreeRegistration({
  action,
  fields,
  tickets,
  labels,
}: {
  action: (p: PublicFormState, fd: FormData) => Promise<PublicFormState>;
  fields: FieldDef[];
  tickets: { id: string; label: string }[];
  labels: { title: string; sub: string; cta: string };
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const v = (name: string) => state.values?.[name] ?? '';
  const nameOf: Record<string, string> = { title: 'title', first: 'firstName', last: 'lastName', email: 'email', mob: 'mobile', spec: 'field1', hosp: 'field2', tk: 'ticketTypeId' };
  const shown = fields.filter((f) => f.enabled && (f.kind !== 'TICKET' || tickets.length > 1));
  // Title sits beside the name on wide panels, as on the prototype.
  return (
    <div className="panel" id="register">
      <h2>{labels.title}</h2>
      <p className="sub">{labels.sub}</p>
      {state.info ? (
        <div className="note ok" role="status">{state.info}</div>
      ) : (
        <form action={formAction} noValidate>
          {state.error && <div className="note err" role="alert">{state.error}</div>}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
          <div className="grid gap-x-3 sm:grid-cols-2">
            {shown.map((f) => (
              <div key={f.key} className={['first', 'last', 'title'].includes(f.key) || f.kind === 'DROPDOWN' ? '' : 'sm:col-span-2'}>
                <FieldInput f={f.kind === 'TICKET' ? { ...f, label: 'How you’re attending' } : f} value={v(nameOf[f.key] ?? `a_${f.key}`)} error={state.fieldErrors?.[f.key]} tickets={tickets} />
              </div>
            ))}
          </div>
          <label className="mb-3 flex items-start gap-2 text-[13px] text-[var(--ink-2)]">
            <input type="checkbox" name="consent" className="mt-1" /> Send me news about future editions. You can unsubscribe at any time.
          </label>
          <button className="btn accent block" disabled={pending}>{pending ? 'Registering…' : labels.cta}</button>
          <p className="fine">You’ll get a confirmation email with your ID straight away.</p>
        </form>
      )}
    </div>
  );
}

export function TicketPicker({ slug, tickets, currency, title }: { slug: string; tickets: { id: string; name: string; description: string; priceMinor: number; left: number | null }[]; currency: string; title: string }) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, number>>({});
  const total = tickets.reduce((t, x) => t + (qty[x.id] ?? 0) * x.priceMinor, 0);
  const count = Object.values(qty).reduce((a, b) => a + b, 0);
  const set = (id: string, n: number, max: number) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(n, max)) }));
  return (
    <div className="panel" id="register">
      <h2>{title}</h2>
      <p className="sub">Up to 10 per order. Each ticket gets its own ID.</p>
      {tickets.map((t) => {
        const max = Math.min(10, t.left ?? 10);
        const n = qty[t.id] ?? 0;
        const soldOut = t.left === 0;
        return (
          <div className={`tk ${soldOut ? 'off' : ''}`} key={t.id}>
            <div>
              <b>{t.name}</b>
              <small>{t.description}{t.left !== null && t.left > 0 && t.left <= 20 ? ` · only ${t.left} left` : ''}</small>
            </div>
            <div className="pr">{soldOut ? 'Sold out' : formatMoney(t.priceMinor, currency, { freeLabel: true })}</div>
            {!soldOut && (
              <div className="qty" role="group" aria-label={`${t.name} tickets`}>
                <button type="button" onClick={() => set(t.id, n - 1, max)} disabled={n === 0} aria-label={`One fewer ${t.name}`}>−</button>
                <output aria-live="polite">{n}</output>
                <button type="button" onClick={() => set(t.id, n + 1, max)} disabled={n >= max} aria-label={`One more ${t.name}`}>+</button>
              </div>
            )}
          </div>
        );
      })}
      <div className="sumrow tot"><span>{count ? `${count} ${count === 1 ? 'ticket' : 'tickets'}` : 'Choose tickets'}</span><span>{formatMoney(total, currency)}</span></div>
      <button
        type="button"
        className="btn accent block mt-3"
        disabled={!count}
        onClick={() => router.push(`/e/${slug}/checkout?t=${Object.entries(qty).filter(([, n]) => n).map(([id, n]) => `${id}:${n}`).join(',')}`)}
      >
        Continue
      </button>
      <p className="fine">A booking fee is shown before you pay.</p>
    </div>
  );
}

export function ClaimPanel({ action, labels }: { action: (p: PublicFormState, fd: FormData) => Promise<PublicFormState>; labels: { title: string; sub: string; idName: string; badge: string; cta: string } }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <div className="panel" id="claim">
      <h2>{labels.title}</h2>
      <p className="sub">{labels.sub}</p>
      <form action={formAction} noValidate>
        {state.error && <div className="note err" role="alert">{state.error}</div>}
        <div className={`fld ${state.fieldErrors?.publicId ? 'invalid' : ''}`}>
          <label htmlFor="publicId">{labels.idName}</label>
          <input id="publicId" name="publicId" className="inp" inputMode="numeric" autoComplete="off" placeholder={`The number on your ${labels.badge}`} defaultValue={state.values?.publicId} />
          {state.fieldErrors?.publicId && <span className="err">{state.fieldErrors.publicId}</span>}
        </div>
        <div className={`fld ${state.fieldErrors?.email ? 'invalid' : ''}`}>
          <label htmlFor="claim-email">Email you registered with</label>
          <input id="claim-email" name="email" type="email" className="inp" autoComplete="email" defaultValue={state.values?.email} />
          {state.fieldErrors?.email && <span className="err">{state.fieldErrors.email}</span>}
        </div>
        <button className="btn accent block" disabled={pending}>{pending ? 'Checking…' : labels.cta}</button>
        <p className="fine">Only people who checked in at the event can claim.</p>
      </form>
    </div>
  );
}
