'use client';

import { useOptimistic, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { setQuickSetting, type QuickKey } from './actions';

interface Props {
  slug: string;
  colour: string;
  initial: Record<QuickKey, boolean>;
  labels: { openLbl: string; openDesc: string; openForm: string; afterLbl: string; afterDesc: string; afterForm: string; certNone: boolean };
  canEdit: boolean;
}

/** What the public homepage shows. Maintenance wins, then after-event, then registration. */
function homeShows(q: Record<QuickKey, boolean>) {
  return q.maintenance ? 'maint' : q.afterEventOn ? 'after' : q.registrationOpen ? 'reg' : 'info';
}

export function QuickSettings({ slug, colour, initial, labels, canEdit }: Props) {
  const [pending, start] = useTransition();
  const [q, setQ] = useOptimistic(initial, (s, [k, v]: [QuickKey, boolean]) => ({ ...s, [k]: v }));
  const toggle = (k: QuickKey, v: boolean) =>
    start(async () => {
      setQ([k, v]);
      await setQuickSetting(slug, k, v);
    });

  const rows: [QuickKey, string, string][] = [
    ['registrationOpen', labels.openLbl, labels.openDesc],
    ['afterEventOn', labels.afterLbl, labels.afterDesc],
    ['maintenance', 'Maintenance', 'Hide the website while you make changes'],
  ];
  const shows = homeShows(q);
  const summary = {
    reg: labels.openForm === 'Tickets' ? 'ticket sales' : 'the registration form',
    after: labels.certNone ? `the ${labels.afterLbl.toLowerCase()}` : 'the certificate claim form',
    maint: 'the maintenance page',
    info: 'event information only, with no form',
  }[shows];

  return (
    <div className="grid gap-5 sm:grid-cols-[1fr_200px]">
      <div>
        {rows.map(([k, title, desc]) => (
          <div className="qs-row" key={k}>
            <div>
              <b id={`qs-${k}`}>{title}</b>
              <small>{desc}</small>
            </div>
            <label className="switch">
              <input type="checkbox" role="switch" aria-labelledby={`qs-${k}`} checked={q[k]} disabled={!canEdit || pending} onChange={(e) => toggle(k, e.target.checked)} />
            </label>
          </div>
        ))}
        <p className="mt-3 text-[12.5px] text-muted" aria-live="polite">
          Your homepage shows <b className="text-ink">{summary}</b>.
        </p>
      </div>
      <div aria-hidden="true" className="overflow-hidden rounded-xl border border-line bg-surface-2">
        <div className="h-3 w-full" style={{ background: colour }} />
        <div className="flex h-[168px] flex-col gap-2 p-3">
          {shows === 'maint' ? (
            <div className="grid flex-1 place-items-center text-center text-[11.5px] text-muted">
              <div><Icon name="tool" size={20} /><br /><b className="text-ink">Maintenance page</b><br />Nothing else is visible</div>
            </div>
          ) : (
            <>
              <b className="text-[12px]">{shows === 'info' ? 'Event information' : shows === 'reg' ? (labels.openForm === 'Tickets' ? 'Get tickets' : 'Registration') : labels.afterForm}</b>
              <i className="block h-2 rounded bg-line" />
              <i className="block h-2 rounded bg-line" />
              {shows !== 'after' && <i className="block h-2 w-3/5 rounded bg-line" />}
              {shows !== 'info' && <span className="mt-auto block h-6 rounded-md" style={{ background: colour }} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
