'use client';

import { useRef } from 'react';

/** A button that asks before doing something that can't be undone from the website. */
export function SiteConfirm({ action, label, title, body, confirm, keep }: { action: () => Promise<void>; label: string; title: string; body: string; confirm: string; keep: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="btn ghost sm" onClick={() => ref.current?.showModal()}>{label}</button>
      <dialog ref={ref} className="panel" style={{ maxWidth: 420, border: 0, borderRadius: 16, padding: 24, color: 'var(--ink)', background: 'var(--surface)' }}>
        <form action={action}>
          <h3 style={{ marginTop: 0 }}>{title}</h3>
          <p style={{ color: 'var(--ink-2)', fontSize: 14 }}>{body}</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" className="btn ghost" onClick={() => ref.current?.close()} autoFocus>{keep}</button>
            <button className="btn primary">{confirm}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
