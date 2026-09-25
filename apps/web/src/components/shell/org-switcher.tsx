import Link from 'next/link';
import type { CurrentUser } from '@/lib/auth';
import { ROLE_LABEL } from '@/lib/auth';
import { Icon } from '@/components/icon';

/** Which organisation the dashboard shows, for people in more than one, and a way to add one. */
export function OrgSwitcher({ user }: { user: CurrentUser }) {
  return (
    <details className="orgsw relative">
      <summary className="btn ghost sm cursor-pointer list-none" aria-label="Switch organisation">
        <span className="max-w-[180px] truncate">{user.organisationName}</span> <Icon name="chevd" size={14} />
      </summary>
      <div className="card absolute right-0 top-[calc(100%+6px)] z-[60] w-[280px] p-1.5 shadow-lg" role="menu">
        {user.organisations.map((o) => (
          <Link key={o.id} role="menuitem" href={`/switch?org=${o.id}`} prefetch={false} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[13.5px] text-ink no-underline hover:bg-surface-2 ${o.id === user.organisationId ? 'font-semibold' : ''}`} aria-current={o.id === user.organisationId ? 'true' : undefined}>
            <span className="flex-1 truncate">{o.name}<small className="block font-normal text-muted">{ROLE_LABEL[o.role]}</small></span>
            {o.id === user.organisationId && <Icon name="check" size={15} />}
          </Link>
        ))}
        <div className="my-1 border-t border-line" />
        <Link role="menuitem" href="/organisation/new" className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13.5px] text-ink no-underline hover:bg-surface-2"><Icon name="plus" size={15} /> New organisation</Link>
      </div>
    </details>
  );
}
