'use client';

import { useState, useTransition } from 'react';

/** A recording link that saves on its own, so organisers can paste links one after another. */
export function RecordingField({ initial, save, label, disabled }: { initial: string; save: (url: string) => Promise<{ error?: string; ok?: string }>; label: string; disabled?: boolean }) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();
  const commit = () => {
    if (value.trim() === saved) return;
    start(async () => {
      const r = await save(value);
      setMsg(r);
      if (!r.error) setSaved(value.trim());
    });
  };
  return (
    <div className="flex min-w-[240px] flex-1 flex-col gap-1">
      <div className="flex gap-2">
        <input
          type="url"
          className="inp flex-1"
          placeholder="https://youtu.be/… or your video host"
          aria-label={label}
          value={value}
          disabled={disabled || pending}
          onChange={(e) => { setValue(e.target.value); setMsg({}); }}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
        />
        {value.trim() !== saved && <button type="button" className="btn secondary sm" onClick={commit} disabled={pending}>{pending ? 'Saving…' : 'Save'}</button>}
      </div>
      {msg.error && <span className="text-[12px] text-danger" role="alert">{msg.error}</span>}
      {msg.ok && !msg.error && <span className="text-[12px] text-ok" role="status">{msg.ok}</span>}
    </div>
  );
}
