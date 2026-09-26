'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '../icon';

export interface NavItem {
  href: string;
  icon: IconName;
  label: string;
  count?: string;
  /** Screens not built yet in this phase; still listed so the structure is visible. */
  soon?: boolean;
  exact?: boolean;
}

export interface SwitcherEvent {
  /** Where the switcher item goes; events by default. */
  href?: string;
  slug: string;
  name: string;
  short: string;
  colour: string;
  sub: string;
}

export function Sidebar({ groups, current, events, product = 'live' }: { groups: [string, NavItem[]][]; current: SwitcherEvent | null; events: SwitcherEvent[]; product?: 'live' | 'play' }) {
  const play = product === 'play';
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onClick = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const isCurrent = (i: NavItem) => (i.exact ? path === i.href : path === i.href || path.startsWith(i.href + '/'));

  return (
    <aside className="sb" id="sidebar" aria-label="Main">
      <div className="flex items-center justify-between px-2">
        <Link href={play ? '/play' : '/events'} className="logo">
          zemmz<small>{play ? 'PLAY' : 'LIVE'}</small>
        </Link>
      </div>

      {current && (
        <div className="relative" ref={menuRef}>
          <button type="button" className="switcher" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} title={play ? 'Switch website' : 'Switch event'}>
            <span className="proj-mark" style={{ background: current.colour }}>{current.short}</span>
            <span className="meta">
              <b>{current.name}</b>
              <small>{current.sub}</small>
            </span>
            <Icon name="chevs" size={16} />
          </button>
          {open && (
            <div role="menu" className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 rounded-xl border border-line bg-surface p-1.5 text-ink shadow-[var(--shadow)]">
              {events.map((e) => (
                <Link key={e.slug} role="menuitem" href={e.href ?? `/events/${e.slug}`} className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-ink no-underline hover:bg-surface-2" aria-current={e.slug === current.slug ? 'true' : undefined}>
                  <span className="proj-mark !h-7 !w-7 !text-[11px]" style={{ background: e.colour }}>{e.short}</span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[13px] font-semibold">{e.name}</b>
                    <small className="block truncate text-[11.5px] text-muted">{e.sub}</small>
                  </span>
                  {e.slug === current.slug && <Icon name="check" size={16} />}
                </Link>
              ))}
              <div className="my-1 border-t border-line" />
              <Link role="menuitem" href={play ? '/play' : '/events'} className="flex items-center gap-2 rounded-lg px-2 py-2 text-[13px] font-medium text-ink no-underline hover:bg-surface-2">
                <Icon name="folder" size={16} /> {play ? 'All websites' : 'All events'}
              </Link>
              <Link role="menuitem" href={play ? '/play?new=1' : '/events/new'} className="flex items-center gap-2 rounded-lg px-2 py-2 text-[13px] font-medium text-brand no-underline hover:bg-surface-2">
                <Icon name="plus" size={16} /> {play ? 'New website' : 'New event'}
              </Link>
            </div>
          )}
        </div>
      )}

      <nav className="nav" aria-label={current ? (play ? 'Website' : 'Event') : 'Main'}>
        {groups.map(([label, items]) => (
          <div key={label}>
            <div className="nav-label">{label}</div>
            {items.map((i) => (
              <Link key={i.href} href={i.href} aria-current={isCurrent(i) ? 'page' : undefined} className={i.soon ? 'soon' : undefined} title={i.soon ? `${i.label} — next phase` : i.label}>
                <Icon name={i.icon} />
                <span>{i.label}</span>
                {i.count && <span className="count">{i.count}</span>}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="sb-foot">{play ? 'zemmz Play' : 'zemmz Live'}</div>
    </aside>
  );
}

/** Opens the sidebar as a drawer on narrow screens. */
export function DrawerToggle() {
  const path = usePathname();
  useEffect(() => {
    document.querySelector('.app')?.removeAttribute('data-drawer');
  }, [path]);
  return (
    <button
      type="button"
      className="btn ghost sm min-[901px]:!hidden"
      aria-controls="sidebar"
      aria-label="Open menu"
      onClick={() => {
        const app = document.querySelector('.app');
        app?.setAttribute('data-drawer', app.getAttribute('data-drawer') === 'open' ? '' : 'open');
      }}
    >
      <Icon name="menu" />
    </button>
  );
}
