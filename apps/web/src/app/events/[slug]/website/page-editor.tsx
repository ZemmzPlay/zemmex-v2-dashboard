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
export function PageEditor({ action, deleteAction, pageId, initial, canEdit }: {
  action: (p: ActionState, fd: FormData) => Promise<ActionState>;
  deleteAction: (fd: FormData) => Promise<void>;
  pageId: string;
  initial: { title: string; bodyHtml: string };
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const body = useRef<HTMLDivElement>(null);
  const hidden = useRef<HTMLInputElement>(null);
  const [block, setBlock] = useState('P');
  const exec = (cmd: string, value?: string) => {
    body.current?.focus();
    document.execCommand(cmd, false, value);
    sync();
  };
  const sync = () => {
    if (hidden.current && body.current) hidden.current.value = body.current.innerHTML;
    const node = document.getSelection()?.anchorNode;
    const el = node instanceof Element ? node : node?.parentElement;
    const b = el?.closest('h2,h3,blockquote,p');
    if (b && body.current?.contains(b)) setBlock(b.tagName);
  };
  const tb = 'grid h-8 min-w-8 place-items-center rounded-md px-2 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink';

  return (
    <div className="card min-w-0 overflow-hidden">
      <form id={`pg-${pageId}`} action={formAction} onSubmit={(e) => { sync(); keepValues(formAction)(e); }}>
      <div className="flex flex-wrap items-end gap-3 border-b border-line p-3.5">
        <div className="fld !mb-0 min-w-[220px] flex-1">
          <label htmlFor="pg-title">Page title</label>
          <input id="pg-title" name="title" className="inp" defaultValue={initial.title} maxLength={60} required disabled={!canEdit} />
        </div>
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
      <input ref={hidden} type="hidden" name="bodyHtml" defaultValue={initial.bodyHtml} />
      <div
        ref={body}
        className="prose-page min-h-[340px] p-5 text-[14.5px] leading-relaxed outline-none focus-visible:bg-surface-2/40"
        contentEditable={canEdit}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Page content"
        onInput={sync}
        onKeyUp={sync}
        onMouseUp={sync}
        onBlur={sync}
        dangerouslySetInnerHTML={{ __html: initial.bodyHtml }}
      />
      </form>
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-3.5 py-2.5">
        <span className="flex-1 text-[12.5px]" aria-live="polite">
          {state.error ? <span className="text-danger">{state.error}</span> : state.ok && !pending ? <span className="text-ok">{state.ok}</span> : <span className="text-muted">Headings, bold, italic, lists and links are kept.</span>}
        </span>
        {canEdit && (
          <>
            <ConfirmButton action={deleteAction} hidden={{ id: pageId }} label="Delete page" className="btn danger-ghost sm" title={`Delete ${initial.title}?`} body="The page and its menu link disappear from the website straight away. This can’t be undone." confirmLabel="Delete page" />
            <button form={`pg-${pageId}`} className="btn primary sm" disabled={pending} onClick={sync}>{pending ? 'Publishing…' : 'Publish page'}</button>
          </>
        )}
      </div>
    </div>
  );
}
