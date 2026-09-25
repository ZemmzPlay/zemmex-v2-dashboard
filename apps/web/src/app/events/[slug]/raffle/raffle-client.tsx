'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import type { DrawResult } from './actions';

interface Pool { value: string; label: string; count: number; countNew: number }

/**
 * The draw itself happens on the server. The names that flicker past while
 * it runs are only for the audience; they don't affect who wins.
 */
export function RaffleClient({ pools, reel, defaultPrize, idName, draw, canDraw }: {
  pools: Pool[];
  reel: string[];
  defaultPrize: string;
  idName: string;
  draw: (pool: string, excludeWinners: boolean, prize: string) => Promise<DrawResult>;
  canDraw: boolean;
}) {
  const [pool, setPool] = useState(pools[0]?.value ?? 'all');
  const [exclude, setExclude] = useState(true);
  const [prize, setPrize] = useState(defaultPrize);
  const [spinning, setSpinning] = useState(false);
  const [shown, setShown] = useState('');
  const [result, setResult] = useState<DrawResult | null>(null);
  const [, start] = useTransition();
  const stage = useRef<HTMLDivElement>(null);
  const current = pools.find((p) => p.value === pool);
  const size = current ? (exclude ? current.countNew : current.count) : 0;

  useEffect(() => {
    if (!spinning || !reel.length) return;
    const t = setInterval(() => setShown(reel[Math.floor(Math.random() * reel.length)]), 70);
    return () => clearInterval(t);
  }, [spinning, reel]);

  const run = () =>
    start(async () => {
      setResult(null);
      setSpinning(true);
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const [res] = await Promise.all([draw(pool, exclude, prize), new Promise((r) => setTimeout(r, reduced ? 0 : 1800))]);
      setSpinning(false);
      setResult(res);
    });

  const w = result?.winner;
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="card card-b">
        <div className="fld">
          <label htmlFor="rf-prize">Prize</label>
          <input id="rf-prize" className="inp" value={prize} onChange={(e) => setPrize(e.target.value)} maxLength={120} placeholder="For example, Two tickets to next year" />
        </div>
        <div className="fld">
          <label htmlFor="rf-pool">Draw from</label>
          <select id="rf-pool" className="sel" value={pool} onChange={(e) => setPool(e.target.value)}>
            {pools.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <label className="switch mb-4">
          <input type="checkbox" checked={exclude} onChange={(e) => setExclude(e.target.checked)} />
          Leave out previous winners
        </label>
        <p className="m-0 mb-3.5 text-muted" aria-live="polite">{size.toLocaleString('en-US')} {size === 1 ? 'person' : 'people'} in the draw.</p>
        <button type="button" className="btn primary h-12 w-full text-[15px]" onClick={run} disabled={!canDraw || !size || spinning || !prize.trim()}>
          <Icon name="gift" size={18} /> {spinning ? 'Drawing…' : 'Pick a random name'}
        </button>
        {!canDraw && <p className="mb-0 mt-2 text-[12.5px] text-muted">Only owners, admins and content editors can draw.</p>}
        {result?.error && <div className="notice err mt-3" role="alert">{result.error}</div>}
      </div>

      <div ref={stage} className="winner" aria-live="polite" aria-busy={spinning}>
        <div className="lbl">{w && !spinning ? `Winner · ${w.prize}` : 'The winner is…'}</div>
        <div className={`nm ${spinning ? 'spin' : ''}`}>{spinning ? shown || '…' : w ? w.name : '—'}</div>
        <small>{w && !spinning ? `${idName} ${w.publicId}${w.detail ? ` · ${w.detail}` : ''}` : spinning ? 'Drawing…' : 'Press the button to draw'}</small>
        {w && !spinning && (
          <button type="button" className="btn secondary sm mt-5 no-fs" onClick={() => stage.current?.requestFullscreen?.()}>
            <Icon name="ext" size={15} /> Show full screen
          </button>
        )}
      </div>
    </div>
  );
}
