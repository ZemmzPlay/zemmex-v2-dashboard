'use client';

import { useRef, useState } from 'react';
import { Icon, type IconName } from '@/components/icon';

type Kind = 'ok' | 'out' | 'warn' | 'err';
interface Feedback { kind: Kind; title: string; detail: string; at?: string }
interface FeedItem { kind: Kind; title: string; at: string }

const ICON: Record<Kind, IconName> = { ok: 'check', out: 'logout', warn: 'alert', err: 'x' };
const DOT: Record<Kind, string> = { ok: '#16A36A', out: '#D9731A', warn: '#C98A00', err: '#C8323A' };

/**
 * The scan field is the biggest thing on the screen (Fitts's law) and keeps
 * focus after every scan, so a handheld scanner in keyboard mode can fire
 * badge after badge. Feedback is colour and words, never colour alone.
 */
export function Console({
  endpoint,
  labels,
  capacity,
  ended,
  initial,
  demoTools,
}: {
  endpoint: string;
  labels: { inLbl: string; outLbl: string; roomLbl: string; badge: string; gates: boolean; checkedInLbl: string };
  capacity: number | null;
  ended: boolean;
  initial: { inRoom: number; checkedIn: number; feed: FeedItem[] };
  demoTools: boolean;
}) {
  const [mode, setMode] = useState<'in' | 'out'>(ended ? 'out' : 'in');
  const [fb, setFb] = useState<Feedback | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>(initial.feed);
  const [counts, setCounts] = useState({ inRoom: initial.inRoom, checkedIn: initial.checkedIn });
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function send(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, ...payload }) });
      const data = await res.json();
      if (res.status >= 500 || (!res.ok && !data.title)) throw new Error(data.error ?? `Server error ${res.status}`);
      setFb({ kind: data.kind, title: data.title, detail: data.detail, at: data.at });
      if (data.input && input.current) input.current.value = data.input;
      if (typeof data.inRoom === 'number') setCounts({ inRoom: data.inRoom, checkedIn: data.checkedIn });
      if (data.at) setFeed((f) => [{ kind: data.kind, title: data.title, at: data.at }, ...f].slice(0, 30));
    } catch (e) {
      setFb({ kind: 'err', title: 'That scan didn’t reach the server', detail: `${(e as Error).message}. Check the connection and scan again.` });
    } finally {
      setBusy(false);
      setTimeout(() => {
        if (input.current) {
          input.current.select();
          input.current.focus();
        }
      }, 0);
    }
  }

  const full = capacity ? counts.inRoom >= capacity : false;
  const cls = fb ? `fb-${fb.kind}` : 'fb-idle';

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <section className="card card-b" aria-labelledby="scan-h">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 id="scan-h" className="m-0 text-[15px] font-semibold">Scan</h2>
          <div className="seg ml-auto" role="group" aria-label="Scan mode">
            <button type="button" aria-pressed={mode === 'in'} onClick={() => { setMode('in'); input.current?.focus(); }} disabled={ended}>{labels.inLbl}</button>
            <button type="button" aria-pressed={mode === 'out'} onClick={() => { setMode('out'); input.current?.focus(); }}>{labels.outLbl}</button>
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = input.current?.value.trim();
            if (!v) return input.current?.focus();
            void send({ input: v });
          }}
        >
          <label htmlFor="scan" className="sr-only">Scan a {labels.badge} or type an ID</label>
          <div className="scanbox">
            <Icon name="scan" size={22} />
            <input id="scan" ref={input} autoFocus inputMode="numeric" autoComplete="off" spellCheck={false} placeholder="Scan or type an ID" aria-describedby="scan-fb" />
            <button className="btn primary" disabled={busy}>{mode === 'in' ? 'Check in' : 'Check out'}</button>
          </div>
        </form>
        <div id="scan-fb" className={`feedback ${cls}`} role="status" aria-live="assertive" key={fb ? `${fb.title}${fb.at}` : 'idle'}>
          <span className="ic"><Icon name={fb ? ICON[fb.kind] : 'scan'} size={22} /></span>
          <span>
            <b>{fb ? fb.title : ended ? 'This has ended. You can still record people leaving.' : `Ready. ${mode === 'in' ? labels.inLbl : labels.outLbl}.`}</b>
            <small>{fb ? fb.detail : `Point the scanner at a ${labels.badge}, or type the ID and press Enter.`}</small>
          </span>
        </div>
        {demoTools && (
          <div className="mt-3 flex flex-wrap gap-2" aria-label="Demo tools">
            <button type="button" className="btn ghost sm" onClick={() => send({ simulate: 'scan' })} disabled={busy}><Icon name="sparkle" size={15} /> Simulate a scan</button>
            <button type="button" className="btn ghost sm" onClick={() => send({ simulate: 'wrong' })} disabled={busy}>Simulate a wrong ID</button>
            {labels.gates && <button type="button" className="btn ghost sm" onClick={() => { setMode('in'); void send({ simulate: 'wrongGate', mode: 'in' }); }} disabled={busy}>Simulate a wrong gate</button>}
            <span className="self-center text-[11.5px] text-muted">Demo tools are hidden in production.</span>
          </div>
        )}
      </section>

      <section className="card card-b" aria-labelledby="live-h">
        <h2 id="live-h" className="sr-only">Live counts and recent scans</h2>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-surface-2 p-3.5">
            <div className="text-[12.5px] text-muted">{labels.roomLbl}</div>
            <div className="mt-1 text-[28px] font-bold tabular-nums" aria-live="polite">{counts.inRoom}{capacity ? <span className="text-[15px] font-medium text-muted"> / {capacity}</span> : null}</div>
            {capacity ? <div className="prog mt-2"><i style={{ width: `${Math.min(100, (counts.inRoom / capacity) * 100)}%`, background: full ? 'var(--danger)' : undefined }} /></div> : null}
            {full && <div className="mt-1.5 text-[12px] font-semibold text-danger">Full. New scans are refused until someone leaves.</div>}
          </div>
          <div className="rounded-xl bg-surface-2 p-3.5">
            <div className="text-[12.5px] text-muted">{labels.checkedInLbl}</div>
            <div className="mt-1 text-[28px] font-bold tabular-nums">{counts.checkedIn}</div>
          </div>
        </div>
        <h3 className="mb-1 mt-4 text-[13px] font-semibold text-ink-2">Recent scans</h3>
        {feed.length === 0 ? (
          <p className="text-[13px] text-muted">Nobody scanned yet.</p>
        ) : (
          <ul className="feed m-0 max-h-[420px] list-none overflow-auto p-0">
            {feed.map((f, i) => (
              <li className="it" key={`${f.at}-${i}`}>
                <span className="dot" style={{ background: DOT[f.kind] }} aria-hidden="true" />
                <span className="min-w-0 truncate">{f.title}</span>
                <time>{f.at}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
