'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '@/components/icon';
import { idbAll, idbDelete, idbGet, idbPut } from '@/lib/idb';
import { scanLocally, type QueuedScan, type Roster } from './offline';

type Kind = 'ok' | 'out' | 'warn' | 'err';
interface Feedback { kind: Kind; title: string; detail: string; at?: string }
interface FeedItem { kind: Kind; title: string; at: string }

const ICON: Record<Kind, IconName> = { ok: 'check', out: 'logout', warn: 'alert', err: 'x' };
const DOT: Record<Kind, string> = { ok: '#16A36A', out: '#D9731A', warn: '#C98A00', err: '#C8323A' };

/**
 * The scan field is the biggest thing on the screen (Fitts's law) and keeps
 * focus after every scan, so a handheld scanner in keyboard mode can fire
 * badge after badge. Feedback is colour and words, never colour alone.
 *
 * Offline: the console keeps the guest list and this session's attendance on
 * the device (IndexedDB), refreshed every minute. When a scan can't reach the
 * server it's decided locally with the same rules, saved, and uploaded in
 * order when the connection is back; the server's answer then wins.
 */
export function Console({
  sessionId,
  rosterUrl,
  syncUrl,
  endpoint,
  labels,
  capacity,
  ended,
  initial,
  demoTools,
}: {
  sessionId: string;
  rosterUrl: string;
  syncUrl: string;
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
  const roster = useRef<Roster | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [waiting, setWaiting] = useState(0);
  const [refused, setRefused] = useState<{ title: string; detail: string }[]>([]);
  const syncing = useRef(false);
  // Times in the event's timezone, like every other time on the console.
  const savedTime = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: roster.current?.event.timezone });

  const refreshRoster = useCallback(async () => {
    try {
      const res = await fetch(rosterUrl, { cache: 'no-store' });
      if (!res.ok) return;
      const r = (await res.json()) as Roster;
      // Scans still waiting to upload are already in the old copy; keep them.
      const queued = ((await idbAll<QueuedScan>('queue')) ?? []).filter((q) => q.sessionId === sessionId);
      if (queued.length && roster.current) return;
      roster.current = r;
      setSavedAt(r.savedAt);
      await idbPut('roster', r, sessionId);
    } catch {
      /* offline: keep the saved copy */
    }
  }, [rosterUrl, sessionId]);

  const flush = useCallback(async () => {
    if (syncing.current) return;
    const queued = ((await idbAll<QueuedScan>('queue')) ?? []).filter((q) => q.sessionId === sessionId);
    setWaiting(queued.length);
    if (!queued.length) return;
    syncing.current = true;
    try {
      const res = await fetch(syncUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scans: queued.slice(0, 200).map(({ id, mode, input, at }) => ({ id, mode, input, at })) }) });
      if (!res.ok) return;
      const data = (await res.json()) as { results: { id: string; kind: Kind; title: string; detail: string }[]; counts: { inRoom: number; checkedIn: number } | null };
      for (const r of data.results) await idbDelete('queue', r.id);
      const bad = data.results.filter((r) => r.kind === 'err' || r.kind === 'warn');
      if (bad.length) setRefused((x) => [...bad.map((b) => ({ title: b.title, detail: b.detail })), ...x].slice(0, 20));
      if (data.counts) setCounts(data.counts);
      setOnline(true);
      const left = ((await idbAll<QueuedScan>('queue')) ?? []).filter((q) => q.sessionId === sessionId).length;
      setWaiting(left);
      if (!left) await refreshRoster();
    } catch {
      setOnline(false);
    } finally {
      syncing.current = false;
    }
  }, [syncUrl, sessionId, refreshRoster]);

  useEffect(() => {
    // Lets this page reload with no connection (public/sw.js). Development
    // skips it so stale builds never get in the way.
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    let alive = true;
    void (async () => {
      const saved = await idbGet<Roster>('roster', sessionId);
      if (alive && saved && !roster.current) {
        roster.current = saved;
        setSavedAt(saved.savedAt);
      }
      await refreshRoster();
      await flush();
    })();
    const goOnline = () => { setOnline(true); void flush(); };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    setOnline(navigator.onLine);
    const t1 = setInterval(() => { if (navigator.onLine) void refreshRoster(); }, 60_000);
    const t2 = setInterval(() => { void flush(); }, 10_000);
    const warn = (e: BeforeUnloadEvent) => { if (syncing.current || document.body.dataset.waiting === '1') e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => {
      alive = false;
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('beforeunload', warn);
      clearInterval(t1);
      clearInterval(t2);
    };
  }, [sessionId, refreshRoster, flush]);

  useEffect(() => {
    document.body.dataset.waiting = waiting ? '1' : '0';
  }, [waiting]);

  /** No connection: decide against the saved list and keep the scan for later. */
  async function scanOffline(value: string) {
    const r = roster.current;
    if (!r) {
      setFb({ kind: 'err', title: 'No connection, and no saved list yet', detail: 'This device hasn’t downloaded the guest list. Reconnect once, then it can keep scanning offline.' });
      return;
    }
    const out = scanLocally(r, mode, value);
    const q: QueuedScan = { id: crypto.randomUUID(), sessionId, mode, input: value, at: new Date().toISOString() };
    await idbPut('queue', q);
    await idbPut('roster', r, sessionId);
    setWaiting((n) => n + 1);
    setOnline(false);
    const d = out.detail.trim();
    setFb({ kind: out.kind, title: out.title, detail: `${d ? `${d}${/[.!?]$/.test(d) ? '' : '.'} ` : ''}Saved on this device; it uploads when the connection is back.`, at: out.at });
    setCounts({ inRoom: out.inRoom, checkedIn: out.checkedIn });
    setFeed((f) => [{ kind: out.kind, title: out.title, at: out.at }, ...f].slice(0, 30));
  }

  async function send(payload: Record<string, unknown>) {
    setBusy(true);
    const value = typeof payload.input === 'string' ? payload.input : '';
    try {
      if (!navigator.onLine && value) {
        await scanOffline(value);
        return;
      }
      let res: Response;
      try {
        res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, ...payload }) });
      } catch {
        // The network failed, not the server: carry on offline.
        if (value) await scanOffline(value);
        else setFb({ kind: 'err', title: 'No connection', detail: 'Demo tools need the server.' });
        return;
      }
      const data = await res.json();
      if (res.status >= 500 || (!res.ok && !data.title)) throw new Error(data.error ?? `Server error ${res.status}`);
      setOnline(true);
      setFb({ kind: data.kind, title: data.title, detail: data.detail, at: data.at });
      if (data.input && input.current) input.current.value = data.input;
      if (typeof data.inRoom === 'number') setCounts({ inRoom: data.inRoom, checkedIn: data.checkedIn });
      if (data.at) setFeed((f) => [{ kind: data.kind, title: data.title, at: data.at }, ...f].slice(0, 30));
      // Keep the saved list in step, so going offline next doesn't let someone in twice.
      const r = roster.current;
      const row = r && data.publicId ? r.people.find((p) => p[0] === data.publicId) : undefined;
      if (r && row && data.action?.type === 'open') (r.intervals[row[1]] ??= []).push([new Date().toISOString(), null]);
      if (r && row && data.action?.type === 'close') {
        const open = r.intervals[row[1]]?.find(([, o]) => o === null);
        if (open) open[1] = new Date().toISOString();
      }
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
          <div data-tour="mode" className="seg ml-auto" role="group" aria-label="Scan mode">
            <button type="button" aria-pressed={mode === 'in'} onClick={() => { setMode('in'); input.current?.focus(); }} disabled={ended}>{labels.inLbl}</button>
            <button type="button" aria-pressed={mode === 'out'} onClick={() => { setMode('out'); input.current?.focus(); }}>{labels.outLbl}</button>
          </div>
        </div>
        {(!online || waiting > 0) && (
          <div className={`notice ${online ? 'info' : 'warn'} mb-3`} role="status">
            {online
              ? `Back online. Uploading ${waiting} ${waiting === 1 ? 'scan' : 'scans'} made offline…`
              : `No connection. Scans are checked against the list saved at ${savedAt ? savedTime(savedAt) : '—'} and kept on this device${waiting ? ` (${waiting} waiting)` : ''}. Don’t close this page.`}
          </div>
        )}
        {refused.length > 0 && (
          <div className="notice err mb-3" role="alert">
            <div className="flex-1">
              <b>{refused.length === 1 ? 'One scan made offline was refused by the server' : `${refused.length} scans made offline were refused by the server`}</b>
              <ul className="m-0 mt-1 pl-4 text-[12.5px]">{refused.slice(0, 5).map((r, i) => <li key={i}>{r.title}{r.detail ? `: ${r.detail}` : ''}</li>)}</ul>
            </div>
            <button type="button" className="btn ghost sm" onClick={() => setRefused([])}>Dismiss</button>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = input.current?.value.trim();
            if (!v) return input.current?.focus();
            void send({ input: v });
          }}
        >
          <label htmlFor="scan" className="sr-only">Scan a {labels.badge} or type an ID</label>
          <div data-tour="scan" className="scanbox">
            <Icon name="scan" size={22} />
            <input id="scan" ref={input} autoFocus inputMode="numeric" autoComplete="off" spellCheck={false} placeholder="Scan or type an ID" aria-describedby="scan-fb" />
            <button className="btn primary" disabled={busy}>{mode === 'in' ? 'Check in' : 'Check out'}</button>
          </div>
        </form>
        <div data-tour="feedback" id="scan-fb" className={`feedback ${cls}`} role="status" aria-live="assertive" key={fb ? `${fb.title}${fb.at}` : 'idle'}>
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

      <section data-tour="counts" className="card card-b" aria-labelledby="live-h">
        <h2 id="live-h" className="sr-only">Live counts and recent scans</h2>
        <p className="m-0 mb-2 flex items-center gap-1.5 text-[12px] text-muted"><span className="inline-block size-2 rounded-full" style={{ background: online ? '#16A36A' : '#C98A00' }} aria-hidden="true" />{online ? 'Online' : 'Offline'}{savedAt ? ` · guest list saved on this device at ${savedTime(savedAt)}` : ''}</p>
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
