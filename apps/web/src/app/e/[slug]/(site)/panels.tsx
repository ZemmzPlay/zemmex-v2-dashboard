'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useState } from 'react';
import { eventType, formatMoney, siteText, type Locale } from '@zemmz/shared';
import { FieldInput, type FieldDef } from '@/components/person-form';
import type { PublicFormState } from '../actions';

export function FreeRegistration({
  action,
  fields,
  tickets,
  type,
  locale,
}: {
  action: (p: PublicFormState, fd: FormData) => Promise<PublicFormState>;
  fields: FieldDef[];
  tickets: { id: string; label: string }[];
  type: string;
  locale: Locale;
}) {
  const t = siteText(eventType(type), locale);
  const [state, formAction, pending] = useActionState(action, {});
  const v = (name: string) => state.values?.[name] ?? '';
  const nameOf: Record<string, string> = { title: 'title', first: 'firstName', last: 'lastName', email: 'email', mob: 'mobile', spec: 'field1', hosp: 'field2', tk: 'ticketTypeId' };
  const shown = fields.filter((f) => f.enabled && (f.kind !== 'TICKET' || tickets.length > 1));
  // Title sits beside the name on wide panels, as on the prototype.
  return (
    <div className="panel" id="register">
      <h2>{t.register}</h2>
      <p className="sub">{t.freeSub}</p>
      {state.info ? (
        <div className="note ok" role="status">{state.info}</div>
      ) : (
        <form action={formAction} noValidate>
          {state.error && <div className="note err" role="alert">{state.error}</div>}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
          <div className="grid gap-x-3 sm:grid-cols-2">
            {shown.map((f) => (
              <div key={f.key} className={['first', 'last', 'title'].includes(f.key) || f.kind === 'DROPDOWN' ? '' : 'sm:col-span-2'}>
                <FieldInput f={f.kind === 'TICKET' ? { ...f, label: t.howAttending } : f} value={v(nameOf[f.key] ?? `a_${f.key}`)} error={state.fieldErrors?.[f.key]} tickets={tickets} text={t} />
              </div>
            ))}
          </div>
          <label className="mb-3 flex items-start gap-2 text-[13px] text-[var(--ink-2)]">
            <input type="checkbox" name="consent" className="mt-1" /> {t.consent}
          </label>
          <button className="btn accent block" disabled={pending}>{pending ? t.registering : t.register}</button>
          <p className="fine">{t.freeFine}</p>
        </form>
      )}
    </div>
  );
}

export function TicketPicker({ slug, tickets, currency, type, locale }: { slug: string; tickets: { id: string; name: string; description: string; priceMinor: number; left: number | null }[]; currency: string; type: string; locale: Locale }) {
  const t = siteText(eventType(type), locale);
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, number>>({});
  const total = tickets.reduce((t, x) => t + (qty[x.id] ?? 0) * x.priceMinor, 0);
  const count = Object.values(qty).reduce((a, b) => a + b, 0);
  const set = (id: string, n: number, max: number) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(n, max)) }));
  return (
    <div className="panel" id="register">
      <h2>{t.getTickets}</h2>
      <p className="sub">{t.perOrder}</p>
      {tickets.map((tk) => {
        const max = Math.min(10, tk.left ?? 10);
        const n = qty[tk.id] ?? 0;
        const soldOut = tk.left === 0;
        return (
          <div className={`tk ${soldOut ? 'off' : ''}`} key={tk.id}>
            <div>
              <b>{tk.name}</b>
              <small>{tk.description}{tk.left !== null && tk.left > 0 && tk.left <= 20 ? t.onlyLeft(tk.left) : ''}</small>
            </div>
            <div className="pr">{soldOut ? t.soldOut : formatMoney(tk.priceMinor, currency, { freeLabel: true })}</div>
            {!soldOut && (
              <div className="qty" role="group" aria-label={`${tk.name} tickets`}>
                <button type="button" onClick={() => set(tk.id, n - 1, max)} disabled={n === 0} aria-label={`One fewer ${tk.name}`}>−</button>
                <output aria-live="polite">{n}</output>
                <button type="button" onClick={() => set(tk.id, n + 1, max)} disabled={n >= max} aria-label={`One more ${tk.name}`}>+</button>
              </div>
            )}
          </div>
        );
      })}
      <div className="sumrow tot"><span>{count ? t.ticketCount(count) : t.chooseTickets}</span><span>{formatMoney(total, currency)}</span></div>
      <button
        type="button"
        className="btn accent block mt-3"
        disabled={!count}
        onClick={() => router.push(`/e/${slug}/checkout?t=${Object.entries(qty).filter(([, n]) => n).map(([id, n]) => `${id}:${n}`).join(',')}`)}
      >
        {t.continue}
      </button>
      <p className="fine">{t.feeFine}</p>
    </div>
  );
}

export function ClaimPanel({ action, type, locale }: { action: (p: PublicFormState, fd: FormData) => Promise<PublicFormState>; type: string; locale: Locale }) {
  const t = siteText(eventType(type), locale);
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <div className="panel" id="claim">
      <h2>{t.claimTitle}</h2>
      <p className="sub">{t.claimSub}</p>
      <form action={formAction} noValidate>
        {state.error && <div className="note err" role="alert">{state.error}</div>}
        <div className={`fld ${state.fieldErrors?.publicId ? 'invalid' : ''}`}>
          <label htmlFor="publicId">{t.v.idName}</label>
          <input id="publicId" name="publicId" className="inp" inputMode="numeric" autoComplete="off" placeholder={t.claimPlaceholder} defaultValue={state.values?.publicId} />
          {state.fieldErrors?.publicId && <span className="err">{state.fieldErrors.publicId}</span>}
        </div>
        <div className={`fld ${state.fieldErrors?.email ? 'invalid' : ''}`}>
          <label htmlFor="claim-email">{t.claimEmail}</label>
          <input id="claim-email" name="email" type="email" className="inp" autoComplete="email" defaultValue={state.values?.email} />
          {state.fieldErrors?.email && <span className="err">{state.fieldErrors.email}</span>}
        </div>
        <button className="btn accent block" disabled={pending}>{pending ? t.checking : t.claimCta}</button>
        <p className="fine">{t.claimFine}</p>
      </form>
    </div>
  );
}
