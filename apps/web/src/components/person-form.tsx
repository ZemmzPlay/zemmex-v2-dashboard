'use client';

import { useActionState } from 'react';
import type { FormState } from '@/app/events/[slug]/registrations/actions';

export interface FieldDef {
  key: string;
  label: string;
  kind: 'TEXT' | 'EMAIL' | 'PHONE' | 'DROPDOWN' | 'DATE' | 'TICKET';
  required: boolean;
  enabled: boolean;
  options: string[];
}

/** FormField.key → form input name. */
export const INPUT_NAME: Record<string, string> = {
  title: 'title', first: 'firstName', last: 'lastName', email: 'email', mob: 'mobile', spec: 'field1', hosp: 'field2', tk: 'ticketTypeId',
};
const AUTOCOMPLETE: Record<string, string> = { first: 'given-name', last: 'family-name', email: 'email', mob: 'tel', title: 'honorific-prefix' };
const PLACEHOLDER: Record<string, string> = { email: 'name@example.com', mob: '+971 50 123 4567' };

export function FieldInput({ f, value, error, tickets, showAll }: { f: FieldDef; value: string; error?: string; tickets?: { id: string; label: string }[]; showAll?: boolean }) {
  if (!f.enabled && !showAll) return null;
  const name = INPUT_NAME[f.key] ?? `a_${f.key}`;
  const id = `fld-${f.key}`;
  const errId = `${id}-err`;
  const common = { id, name, 'aria-invalid': !!error || undefined, 'aria-describedby': error ? errId : undefined, required: f.required };
  let control: React.ReactNode;
  if (f.kind === 'TICKET') {
    control = (
      <select {...common} className="sel" defaultValue={value}>
        <option value="">Choose a ticket</option>
        {tickets?.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
    );
  } else if (f.kind === 'DROPDOWN') {
    control = (
      <select {...common} className="sel" defaultValue={value} autoComplete={AUTOCOMPLETE[f.key]}>
        <option value="">{f.required ? 'Choose one' : 'Not given'}</option>
        {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
        {value && !f.options.includes(value) && <option value={value}>{value}</option>}
      </select>
    );
  } else {
    const type = f.kind === 'EMAIL' ? 'email' : f.kind === 'PHONE' ? 'tel' : f.kind === 'DATE' ? 'date' : 'text';
    control = <input {...common} className="inp" type={type} defaultValue={value} autoComplete={AUTOCOMPLETE[f.key]} placeholder={PLACEHOLDER[f.key]} inputMode={f.kind === 'PHONE' ? 'tel' : undefined} />;
  }
  return (
    <div className={`fld ${error ? 'invalid' : ''}`}>
      <label htmlFor={id}>
        {f.label}
        {f.required ? <span className="req" aria-hidden="true">*</span> : <span className="opt">optional</span>}
      </label>
      {control}
      {error && <span className="err" id={errId}>{error}</span>}
    </div>
  );
}

export function PersonForm({
  action,
  fields,
  tickets,
  initial,
  submitLabel,
  cancelHref,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  fields: FieldDef[];
  tickets: { id: string; label: string }[];
  initial: Record<string, string>;
  submitLabel: string;
  cancelHref?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const v = (f: FieldDef) => state.values?.[INPUT_NAME[f.key] ?? `a_${f.key}`] ?? initial[f.key] ?? '';
  const pairs = fields.filter((f) => f.enabled || initial[f.key]);
  return (
    <form action={formAction} noValidate className="max-w-[760px]">
      {state.error && <div className="notice err mb-4" role="alert">{state.error}</div>}
      {state.ok && <div className="notice ok mb-4" role="status">{state.ok}</div>}
      <div className="fsec">
        <div className="grid gap-x-4 sm:grid-cols-2">
          {pairs.map((f) => (
            <FieldInput key={f.key} f={f} value={v(f)} error={state.fieldErrors?.[f.key]} tickets={tickets} showAll />
          ))}
        </div>
      </div>
      <div className="flex gap-2.5">
        <button className="btn primary" disabled={pending}>{pending ? 'Saving…' : submitLabel}</button>
        {cancelHref && <a href={cancelHref} className="btn ghost">Cancel</a>}
      </div>
    </form>
  );
}
