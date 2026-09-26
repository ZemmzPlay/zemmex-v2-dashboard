'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Score and screenshot for one match; the screenshot is previewed before it's sent. */
export function ReportForm({ endpoint, matchId, a, b, t }: {
  endpoint: string; matchId: string; a: string; b: string;
  t: { reportT: string; reportSub: string; shot: string; drop: string; replace: string; submitReport: string; cancel: string; report: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  if (!open) return <><button type="button" className="btn primary sm" onClick={() => { setOpen(true); setOk(''); }}>{t.report}</button>{ok && <span className="status s-wait">{ok}</span>}</>;
  return (
    <form
      className="panel" style={{ marginTop: 14, width: '100%' }} noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        const fd = new FormData(e.currentTarget);
        fd.set('match', matchId);
        try {
          const r = await fetch(endpoint, { method: 'POST', body: fd });
          const body = await r.json().catch(() => ({}));
          if (!r.ok) setError(body.error ?? 'Try again.');
          else { setOk(body.ok); setOpen(false); setPreview(null); router.refresh(); }
        } catch {
          setError('The connection dropped. Try again.');
        }
        setBusy(false);
      }}
    >
      <h3>{t.reportT}</h3>
      <p style={{ margin: '0 0 16px', color: 'var(--muted)', fontSize: 14 }}>{t.reportSub}</p>
      {error && <div className="notice err" role="alert">{error}</div>}
      <div className="score">
        <div className="fld"><label htmlFor={`a-${matchId}`}>{a}</label><input id={`a-${matchId}`} name="scoreA" className="inp" type="number" min={0} max={999} required /></div>
        <span className="vs">–</span>
        <div className="fld"><label htmlFor={`b-${matchId}`}>{b}</label><input id={`b-${matchId}`} name="scoreB" className="inp" type="number" min={0} max={999} required /></div>
      </div>
      <div className="fld">
        <label htmlFor={`s-${matchId}`}>{t.shot}</label>
        <div className="drop">
          {preview ? <img src={preview} alt="" /> : <svg className="i" viewBox="0 0 24 24" style={{ width: 26, height: 26 }} aria-hidden="true"><path d="M12 20V9M7 14l5-5 5 5M4 4h16" /></svg>}
          <div>{preview ? t.replace : t.drop}</div>
          <input id={`s-${matchId}`} type="file" name="shot" accept="image/png,image/jpeg,image/webp" required onChange={(e) => { const f = e.target.files?.[0]; setPreview(f ? URL.createObjectURL(f) : null); }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn ghost" onClick={() => setOpen(false)}>{t.cancel}</button>
        <button className="btn primary" disabled={busy}>{busy ? '…' : t.submitReport}</button>
      </div>
    </form>
  );
}
