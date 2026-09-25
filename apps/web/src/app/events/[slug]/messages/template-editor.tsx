'use client';

import { useActionState, useMemo, useRef, useState } from 'react';
import { applyMergeTags, MERGE_TAGS, sanitizeRichText, type MergeValues } from '@zemmz/shared';
import type { MsgState } from './actions';
import { keepValues } from '@/lib/use-keep-values';

/**
 * Subject and body with merge tags, and a live preview using a sample
 * registration. The preview uses the same sanitiser and merge code as the
 * email the worker sends.
 */
export function TemplateEditor({
  action,
  initial,
  sample,
  accent,
  withKicker,
  submitLabel,
  children,
  confirmText,
  testAction,
}: {
  action: (p: MsgState, fd: FormData) => Promise<MsgState>;
  initial: { subject: string; bodyHtml: string; kicker?: string };
  sample: MergeValues;
  accent: string;
  withKicker?: boolean;
  submitLabel: string;
  children?: React.ReactNode;
  confirmText?: string;
  testAction?: (p: MsgState, fd: FormData) => Promise<MsgState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [testState, testFormAction, testing] = useActionState<MsgState, FormData>(testAction ?? (async () => ({})), {});
  const [last, setLast] = useState<'main' | 'test'>('main');
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.bodyHtml);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const preview = useMemo(() => applyMergeTags(sanitizeRichText(body), sample, { html: true }), [body, sample]);

  const insert = (tag: string) => {
    const el = bodyRef.current;
    if (!el) return;
    const [a, b] = [el.selectionStart, el.selectionEnd];
    const next = body.slice(0, a) + `{${tag}}` + body.slice(b);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + tag.length + 2, a + tag.length + 2);
    });
  };

  return (
    <form
      action={formAction}
      className="grid items-start gap-4 xl:grid-cols-2"
      onSubmit={(e) => {
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const test = !!submitter?.hasAttribute('formaction');
        if (confirmText && !test && !window.confirm(confirmText)) { e.preventDefault(); return; }
        keepValues(test ? testFormAction : formAction)(e);
      }}
    >
      <div>
        {(last === 'test' ? testState : state).error && <div className="notice err mb-4" role="alert">{(last === 'test' ? testState : state).error}</div>}
        {(last === 'test' ? testState : state).ok && <div className="notice ok mb-4" role="status">{(last === 'test' ? testState : state).ok}</div>}
        <div className="fsec">
          {children}
          {withKicker && (
            <div className="fld">
              <label htmlFor="kicker">Label above the event name</label>
              <input id="kicker" name="kicker" className="inp" defaultValue={initial.kicker} maxLength={40} />
            </div>
          )}
          <div className="fld">
            <label htmlFor="subject">Subject</label>
            <input id="subject" name="subject" className="inp" value={subject} onChange={(e) => setSubject(e.target.value)} required maxLength={200} />
          </div>
          <div className="fld">
            <label htmlFor="bodyHtml">Message</label>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Insert a merge tag">
              {MERGE_TAGS.map(([k, l]) => (
                <button key={k} type="button" className="chip h-7 rounded-full border border-line-2 bg-surface px-2.5 text-[12px] hover:border-brand hover:text-brand" onClick={() => insert(k)} title={`Insert ${l}`}>
                  {`{${k}}`}
                </button>
              ))}
            </div>
            <textarea id="bodyHtml" name="bodyHtml" ref={bodyRef} className="inp min-h-[220px] font-mono text-[12.5px]" value={body} onChange={(e) => setBody(e.target.value)} required />
            <span className="help">Paragraphs, bold, italic, links, lists and headings are kept. Anything else is removed before sending.</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button className="btn primary" disabled={pending || testing} onClick={() => setLast('main')}>{pending ? 'Working…' : submitLabel}</button>
          {testAction && <button className="btn secondary" formAction={testFormAction} formNoValidate disabled={pending || testing} onClick={() => setLast('test')}>{testing ? 'Sending…' : 'Send me a test'}</button>}
        </div>
      </div>
      <div className="sticky top-[84px]">
        <div className="mb-2 text-[12.5px] text-muted">Preview with a sample {sample.full_name ? `(${sample.full_name})` : ''}</div>
        <div className="overflow-hidden rounded-2xl border border-line bg-white text-[#1F1D3D] shadow-[var(--shadow)]">
          <div className="border-b border-[#E6E6F0] px-5 py-3 text-[13px]"><b>{applyMergeTags(subject, sample, { html: false })}</b></div>
          <div className="px-5 py-4 text-[12px] font-bold tracking-[.08em] text-white" style={{ background: accent }}>{initial.kicker || 'MESSAGE'}</div>
          <div className="prose-email px-5 py-4 text-[14.5px] leading-relaxed [&_a]:text-[#0B5CFF] [&_h2]:text-lg [&_p]:my-2" dangerouslySetInnerHTML={{ __html: preview }} />
        </div>
      </div>
    </form>
  );
}
