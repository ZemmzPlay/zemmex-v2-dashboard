'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Icon } from './icon';

/**
 * A file button that uploads as soon as a file is chosen, one or several,
 * then refreshes the page so the new file shows. Errors say what to change.
 */
export function Uploader({ slug, kind, target, label, accept, multiple, hint, className = 'btn secondary sm', disabled }: {
  slug: string;
  kind: 'LOGO' | 'PERSON_PHOTO' | 'GALLERY_PHOTO' | 'SLIDES';
  target?: string;
  label: string;
  accept: string;
  multiple?: boolean;
  hint?: string;
  className?: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const upload = async (files: FileList) => {
    setError('');
    const list = [...files];
    for (const [i, f] of list.entries()) {
      setBusy(list.length > 1 ? `Uploading ${i + 1} of ${list.length}…` : 'Uploading…');
      const fd = new FormData();
      fd.set('file', f);
      fd.set('kind', kind);
      if (target) fd.set('target', target);
      try {
        const r = await fetch(`/events/${slug}/files`, { method: 'POST', body: fd });
        const body = await r.json().catch(() => ({}));
        if (!r.ok) {
          setError(`${list.length > 1 ? `${f.name}: ` : ''}${body.error ?? 'The upload failed. Try again.'}`);
          break;
        }
      } catch {
        setError('The upload was interrupted. Check your connection and try again.');
        break;
      }
    }
    setBusy('');
    if (input.current) input.current.value = '';
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-1">
      <label className={`${className} relative cursor-pointer ${busy || disabled ? 'pointer-events-none opacity-60' : ''}`}>
        <Icon name="download" size={15} className="rotate-180" /> {busy || label}
        <input
          ref={input}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={!!busy || disabled}
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(e) => e.target.files?.length && upload(e.target.files)}
        />
      </label>
      {hint && !error && <span className="text-[12px] text-muted">{hint}</span>}
      {error && <span className="text-[12px] text-danger" role="alert">{error}</span>}
    </div>
  );
}
