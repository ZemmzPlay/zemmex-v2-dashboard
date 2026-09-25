'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Icon } from './icon';

/**
 * Uploads a recording straight to storage with a progress bar: ask for a
 * ticket, send the file (XHR, for progress), then have it checked and attached.
 */
export function VideoUploader({ slug, sessionId, label, disabled }: { slug: string; sessionId: string; label: string; disabled?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [error, setError] = useState('');

  const send = (url: string, file: File, contentType: string) =>
    new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.upload.onprogress = (e) => e.lengthComputable && setPct(Math.round((e.loaded / e.total) * 100));
      xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(JSON.parse(xhr.responseText || '{}').error ?? 'The upload failed.')));
      xhr.onerror = () => reject(new Error('The upload was interrupted. Check your connection and try again.'));
      xhr.send(file);
    });

  const upload = async (file: File) => {
    setError('');
    setPct(0);
    try {
      const start = await fetch(`/events/${slug}/files/video`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, name: file.name, size: file.size }) });
      const t = await start.json();
      if (!start.ok) throw new Error(t.error ?? 'The upload couldn’t start.');
      await send(t.url, file, t.contentType);
      setPct(100);
      const done = await fetch(`/events/${slug}/files/video/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket: t.ticket }) });
      const d = await done.json();
      if (!done.ok) throw new Error(d.error ?? 'The video couldn’t be saved.');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPct(null);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <label className={`btn secondary sm relative cursor-pointer ${pct !== null || disabled ? 'pointer-events-none opacity-60' : ''}`}>
        <Icon name="download" size={15} className="rotate-180" /> {pct !== null ? `Uploading ${pct}%` : label}
        <input ref={input} type="file" accept="video/mp4,video/quicktime,video/webm" className="sr-only" disabled={disabled || pct !== null} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </label>
      {pct !== null && <span className="prog block w-[140px]"><i style={{ width: `${pct}%` }} /></span>}
      {error && <span className="max-w-[260px] text-[12px] text-danger" role="alert">{error}</span>}
    </div>
  );
}
