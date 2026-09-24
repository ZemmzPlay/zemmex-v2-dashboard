'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Icon } from './icon';

/**
 * Filters as you type by updating the URL (debounced), so results are
 * shareable and survive a reload. Press / anywhere to focus it.
 */
export function SearchBox({ placeholder, label, param = 'q' }: { placeholder: string; label: string; param?: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get(param) ?? '');
  const [pending, start] = useTransition();
  const ref = useRef<HTMLInputElement>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(param, value);
      else next.delete(param);
      next.delete('page');
      start(() => router.replace(`${path}?${next.toString()}`, { scroll: false }));
    }, 180);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(el.tagName) && !el.isContentEditable) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="search" role="search">
      <label htmlFor="search" className="sr-only">{label}</label>
      <Icon name="search" size={16} />
      <input ref={ref} id="search" className="inp" type="search" placeholder={placeholder} value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" aria-busy={pending} />
    </div>
  );
}
