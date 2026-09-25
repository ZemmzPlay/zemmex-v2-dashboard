'use client';

import { useActionState } from 'react';
import { eventType, siteText, type Locale } from '@zemmz/shared';
import type { PublicFormState } from '../../../actions';

interface Q { id: string; text: string; kind: 'RATING' | 'CHECK' | 'CHOICE' | 'TEXT'; group: string; required: boolean }


/** Ratings as radio groups (keyboard-friendly by default), ticked statements, comments. */
export function EvaluationForm({ action, questions, type, locale }: { action: (p: PublicFormState, fd: FormData) => Promise<PublicFormState>; questions: Q[]; type: string; locale: Locale }) {
  const t = siteText(eventType(type), locale);
  const SCALE = t.scale.map((l, i) => [i + 1, l] as [number, string]);
  const [state, formAction, pending] = useActionState(action, {});
  const groups: { group: string; items: Q[] }[] = [];
  for (const q of questions) {
    const g = q.kind === 'CHECK' ? q.group : '';
    const last = groups[groups.length - 1];
    if (last && last.group === g && (g || q.kind === last.items[0].kind)) last.items.push(q);
    else groups.push({ group: g, items: [q] });
  }
  return (
    <form action={formAction} noValidate>
      {state.error && <div className="note err" role="alert">{state.error}</div>}
      {groups.map((g, gi) => {
        const first = g.items[0];
        if (first.kind === 'CHECK') {
          return (
            <fieldset key={gi} className="mb-6 rounded-xl border border-[var(--line)] p-4">
              <legend className="px-1 font-semibold">{g.group || t.tickAny}</legend>
              {g.items.map((q) => (
                <label key={q.id} className="flex items-start gap-2.5 py-1.5 text-[14.5px]">
                  <input type="checkbox" name={`q_${q.id}`} className="mt-1" defaultChecked={state.values?.[`q_${q.id}`] === 'on'} /> {q.text}
                </label>
              ))}
            </fieldset>
          );
        }
        return (
          <div key={gi}>
            {g.items.map((q) =>
              q.kind === 'TEXT' ? (
                <div className="fld" key={q.id}>
                  <label htmlFor={`q_${q.id}`}>{q.text}{!q.required && <span className="opt">{t.optional}</span>}</label>
                  <textarea id={`q_${q.id}`} name={`q_${q.id}`} className="inp !h-24 py-2" maxLength={2000} defaultValue={state.values?.[`q_${q.id}`]} />
                </div>
              ) : (
                <fieldset key={q.id} className={`mb-4 border-0 border-b border-[var(--line)] p-0 pb-4 ${state.fieldErrors?.[q.id] ? 'text-[var(--err)]' : ''}`} aria-invalid={!!state.fieldErrors?.[q.id] || undefined}>
                  <legend className="mb-2 text-[14.5px] font-semibold">{q.text}{q.required && <span className="req" aria-hidden="true"> *</span>}</legend>
                  <div className="flex flex-wrap gap-2">
                    {SCALE.map(([n, l]) => (
                      <label key={n} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--line)] px-3 py-1.5 text-[13px] text-[var(--ink)] has-[:checked]:border-[var(--accent)] has-[:checked]:bg-[var(--accent-soft)]">
                        <input type="radio" name={`q_${q.id}`} value={n} defaultChecked={state.values?.[`q_${q.id}`] === String(n)} /> {l}
                      </label>
                    ))}
                  </div>
                  {state.fieldErrors?.[q.id] && <span className="mt-1 block text-[12px]">{state.fieldErrors[q.id]}</span>}
                </fieldset>
              ),
            )}
          </div>
        );
      })}
      <button className="btn accent" disabled={pending}>{pending ? t.sending : t.submit}</button>
    </form>
  );
}
