'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { TourStep } from '@/lib/help';
import { Icon } from './icon';

const KEY = 'zemmz-tour';
interface State { steps: TourStep[]; i: number }

const read = (): State | null => {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
};
const write = (s: State | null) => {
  try {
    if (s) sessionStorage.setItem(KEY, JSON.stringify(s));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private mode: the tour simply ends */
  }
};

/** Starts a tour: remembers its steps and opens the first page. */
export function TourButton({ steps, label = 'Show me on screen', className = 'btn primary' }: { steps: TourStep[]; label?: string; className?: string }) {
  const router = useRouter();
  return (
    <button type="button" className={className} onClick={() => { write({ steps, i: 0 }); router.push(steps[0].path); window.dispatchEvent(new Event('zemmz-tour')); }}>
      <Icon name="sparkle" size={16} /> {label}
    </button>
  );
}

/** Draws the current step over the page: a cut-out around the element and a card that explains it. */
export function TourRunner() {
  const router = useRouter();
  const path = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<State | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const here = `${path}${search.toString() ? `?${search}` : ''}`;
  const onPage = (s: TourStep) => (s.path.includes('?') ? here === s.path : path === s.path);

  useEffect(() => {
    const sync = () => setState(read());
    sync();
    window.addEventListener('zemmz-tour', sync);
    return () => window.removeEventListener('zemmz-tour', sync);
  }, [here]);

  const step = state?.steps[state.i];
  useEffect(() => {
    setRect(null);
    if (!step || !onPage(step)) return;
    let tries = 0;
    let el: Element | null = null;
    const place = () => el && setRect(el.getBoundingClientRect());
    const find = setInterval(() => {
      el = document.querySelector(step.sel);
      if (el || ++tries > 50) {
        clearInterval(find);
        if (el) {
          el.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
          setTimeout(place, 350);
        }
      }
    }, 100);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { clearInterval(find); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.sel, step?.path, here]);

  const go = useCallback((i: number) => {
    if (!state) return;
    if (i < 0 || i >= state.steps.length) { write(null); setState(null); return; }
    const next = { ...state, i };
    write(next);
    setState(next);
    if (!onPage(next.steps[i])) router.push(next.steps[i].path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, here]);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') go(-1); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state, go]);

  if (!state || !step || !onPage(step) || !rect) return null;
  const pad = 8;
  const below = rect.bottom + 220 < window.innerHeight;
  const top = below ? rect.bottom + pad + 10 : Math.max(12, rect.top - pad - 10 - 190);
  const left = Math.min(Math.max(12, rect.left), window.innerWidth - 352);
  return (
    <div className="no-print" aria-live="polite">
      <div className="pointer-events-none fixed z-[90] rounded-xl transition-all" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: '0 0 0 3px var(--brand), 0 0 0 9999px rgba(7,5,46,.5)' }} />
      <div role="dialog" aria-label={step.title} className="fixed z-[91] w-[340px] max-w-[calc(100vw-24px)] rounded-2xl bg-surface p-4 text-ink shadow-[0_30px_60px_-20px_rgba(7,5,46,.5)]" style={{ top, left }}>
        <div className="mb-1 text-[12px] text-muted">Step {state.i + 1} of {state.steps.length}</div>
        <b className="block text-[15px]">{step.title}</b>
        <p className="mb-3 mt-1 text-[13.5px] text-ink-2">{step.text}</p>
        <div className="flex items-center gap-2">
          <button type="button" className="btn ghost sm" onClick={() => go(-1)}>Close</button>
          <span className="flex-1" />
          {state.i > 0 && <button type="button" className="btn secondary sm" onClick={() => go(state.i - 1)}>Back</button>}
          <button type="button" className="btn primary sm" autoFocus onClick={() => go(state.i + 1)}>{state.i === state.steps.length - 1 ? 'Done' : 'Next'}</button>
        </div>
      </div>
    </div>
  );
}
