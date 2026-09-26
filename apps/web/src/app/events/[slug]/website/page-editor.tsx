'use client';

import { useActionState, useRef, useState } from 'react';
import { ConfirmButton } from '@/components/confirm-button';
import type { ActionState } from '@/lib/action-state';
import { keepValues } from '@/lib/use-keep-values';

type Cmd = [string, string, string?];
const INLINE: [string, string, React.CSSProperties][] = [['bold', 'B', { fontWeight: 700 }], ['italic', 'I', { fontStyle: 'italic' }], ['underline', 'U', { textDecoration: 'underline' }]];
const LISTS: Cmd[] = [['insertUnorderedList', '• List'], ['insertOrderedList', '1. List']];

/**
 * A small rich-text editor. What it produces is sanitised on the server with
 * the same allowlist the website uses, so formatting it can't keep (colours,
 * alignment) is never offered.
 */
export function PageEditor({ action, deleteAction, pageId, initial, arabic, canEdit, fixedTitle, saveLabel = 'Publish page' }: {
  action: (p: ActionState, fd: FormData) => Promise<ActionState>;
  /** Pages that can't be deleted or renamed (a tournament website's rules) leave this out and pass fixedTitle. */
  deleteAction?: (fd: FormData) => Promise<void>;
  fixedTitle?: string;
  saveLabel?: string;
  pageId: string;
  initial: { title: string; bodyHtml: string };
  /** The Arabic version, when the website is in Arabic or both. Empty falls back to the English. */
  arabic?: { title: string; bodyHtml: string };
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [lang, setLang] = useState<'en' | 'ar'>('en');
  const bodyEn = useRef<HTMLDivElement>(null);
  const bodyAr = useRef<HTMLDivElement>(null);
  const hiddenEn = useRef<HTMLInputElement>(null);
  const hiddenAr = useRef<HTMLInputElement>(null);
  const body = lang === 'ar' ? bodyAr : bodyEn;
  const [block, setBlock] = useState('P');
  const exec = (cmd: string, value?: string) => {
    body.current?.focus();
    document.execCommand(cmd, false, value);
    sync();
  };
  const sync = () => {
    if (hiddenEn.current && bodyEn.current) hiddenEn.current.value = bodyEn.current.innerHTML;
    if (hiddenAr.current && bodyAr.current) hiddenAr.current.value = bodyAr.current.innerHTML;
    const node = document.getSelection()?.anchorNode;
    const el = node instanceof Element ? node : node?.parentElement;
    const b = el?.closest('h2,h3,blockquote,p');
    if (b && body.current?.contains(b)) setBlock(b.tagName);
  };
  const area = (ref: React.RefObject<HTMLDivElement | null>, html: string, ar: boolean) => (
    <div
      ref={ref}
      hidden={(lang === 'ar') !== ar}
      dir={ar ? 'rtl' : undefined}
      lang={ar ? 'ar' : undefined}
      className="prose-page min-h-[340px] p-5 text-[14.5px] leading-relaxed outline-none focus-visible:bg-surface-2/40"
      contentEditable={canEdit}
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label={ar ? 'Page content in Arabic' : 'Page content'}
      onInput={sync}
      onKeyUp={sync}
      onMouseUp={sync}
      onBlur={sync}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
  const tb = 'grid h-8 min-w-8 place-items-center rounded-md px-2 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink';

  return (
    <div className="card min-w-0 overflow-hidden">
      <form id={`pg-${pageId}`} action={formAction} onSubmit={(e) => { sync(); keepValues(formAction)(e); }}>
      <div className="flex flex-wrap items-end gap-3 border-b border-line p-3.5">
        {fixedTitle ? <h2 className="m-0 flex-1 self-center text-[15px] font-semibold">{fixedTitle}</h2> : (
        <div className="fld !mb-0 min-w-[220px] flex-1" hidden={lang === 'ar'}>
          <label htmlFor="pg-title">Page title</label>
          <input id="pg-title" name="title" className="inp" defaultValue={initial.title} maxLength={60} required disabled={!canEdit} />
        </div>
        )}
        {arabic && !fixedTitle && (
          <div className="fld !mb-0 min-w-[220px] flex-1" hidden={lang === 'en'}>
            <label htmlFor="pg-title-ar">Page title in Arabic<span className="opt">optional</span></label>
            <input id="pg-title-ar" name="ar_title" dir="rtl" lang="ar" className="inp" defaultValue={arabic.title} maxLength={60} disabled={!canEdit} />
          </div>
        )}
        {arabic && (
          <div className="seg" role="group" aria-label="Language">
            <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>English</button>
            <button type="button" aria-pressed={lang === 'ar'} onClick={() => setLang('ar')}>العربية</button>
          </div>
        )}
      </div>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-1 border-b border-line px-2.5 py-1.5" role="toolbar" aria-label="Formatting" onMouseDown={(e) => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); }}>
          <select className="sel !h-8 text-[13px]" aria-label="Text style" value={block} onChange={(e) => { setBlock(e.target.value); exec('formatBlock', e.target.value); }}>
            <option value="P">Body</option>
            <option value="H2">Heading</option>
            <option value="H3">Subheading</option>
            <option value="BLOCKQUOTE">Quote</option>
          </select>
          <span className="mx-1 h-5 w-px bg-line" />
          {INLINE.map(([c, l, style]) => <button key={c} type="button" className={tb} style={style} aria-label={c.charAt(0).toUpperCase() + c.slice(1)} onClick={() => exec(c)}>{l}</button>)}
          <span className="mx-1 h-5 w-px bg-line" />
          {LISTS.map(([c, l]) => <button key={c} type="button" className={tb} onClick={() => exec(c)}>{l}</button>)}
          <button type="button" className={tb} onClick={() => {
            const url = window.prompt('Link to (https://…, mailto: or /e/…)');
            if (url) exec('createLink', url.trim());
          }}>Link</button>
          <button type="button" className={tb} onClick={() => { exec('removeFormat'); exec('unlink'); }}>Clear formatting</button>
        </div>
      )}
      <input ref={hiddenEn} type="hidden" name="bodyHtml" defaultValue={initial.bodyHtml} />
      {arabic && <input ref={hiddenAr} type="hidden" name="ar_bodyHtml" defaultValue={arabic.bodyHtml} />}
      {area(bodyEn, initial.bodyHtml, false)}
      {arabic && area(bodyAr, arabic.bodyHtml, true)}
      {arabic && lang === 'ar' && <p className="m-0 border-t border-line px-5 py-2 text-[12px] text-muted">Leave empty to show the English on the Arabic website.</p>}
      </form>
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-3.5 py-2.5">
        <span className="flex-1 text-[12.5px]" aria-live="polite">
          {state.error ? <span className="text-danger">{state.error}</span> : state.ok && !pending ? <span className="text-ok">{state.ok}</span> : <span className="text-muted">Headings, bold, italic, lists and links are kept.</span>}
        </span>
        {canEdit && (
          <>
            {deleteAction && <ConfirmButton action={deleteAction} hidden={{ id: pageId }} label="Delete page" className="btn danger-ghost sm" title={`Delete ${initial.title}?`} body="The page and its menu link disappear from the website straight away. This can’t be undone." confirmLabel="Delete page" />}
            <button form={`pg-${pageId}`} className="btn primary sm" disabled={pending} onClick={sync}>{pending ? 'Saving…' : saveLabel}</button>
          </>
        )}
      </div>
    </div>
  );
}
