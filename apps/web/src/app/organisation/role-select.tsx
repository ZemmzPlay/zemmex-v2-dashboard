'use client';

import { useState, useTransition } from 'react';
import type { ActionState } from '@/lib/action-state';

/** Changes a member's role as soon as a new one is picked, and says what happened. */
export function RoleSelect({ value, options, action, label }: { value: string; options: [string, string][]; action: (role: string) => Promise<ActionState>; label: string }) {
  const [pending, start] = useTransition();
  const [role, setRole] = useState(value);
  const [msg, setMsg] = useState<ActionState>({});
  return (
    <div className="flex flex-col gap-1">
      <select
        className="sel !h-9 max-w-[180px] text-[13px]"
        aria-label={label}
        value={role}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          const prev = role;
          setRole(next);
          start(async () => {
            const r = await action(next);
            setMsg(r);
            if (r.error) setRole(prev);
          });
        }}
      >
        {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {msg.error && <span className="text-[12px] text-danger" role="alert">{msg.error}</span>}
      {msg.ok && <span className="text-[12px] text-ok" role="status">{msg.ok}</span>}
    </div>
  );
}
