'use client';

import { useOptimistic, useTransition } from 'react';

/** A switch that saves as soon as it's flipped. */
export function ActionSwitch({
  checked,
  action,
  label,
  showLabel,
  disabled,
}: {
  checked: boolean;
  action: (value: boolean) => Promise<void>;
  label: string;
  showLabel?: boolean;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const [on, setOn] = useOptimistic(checked);
  return (
    <label className="switch">
      <input
        type="checkbox"
        role="switch"
        checked={on}
        disabled={disabled || pending}
        aria-label={showLabel ? undefined : label}
        onChange={(e) => {
          const v = e.target.checked;
          start(async () => {
            setOn(v);
            await action(v);
          });
        }}
      />
      {showLabel && <span>{label}</span>}
    </label>
  );
}
