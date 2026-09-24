import type { SessionStatus } from '@zemmz/db';

/** Status colour follows meaning: green done or running, amber attention, red stopped (docs/06, finding 1). */
export function SessionBadge({ status, gates }: { status: SessionStatus; gates?: boolean }) {
  if (status === 'LIVE') return <span className="badge b-ok b-live">{gates ? 'Open' : 'Live now'}</span>;
  if (status === 'ENDED') return <span className="badge b-neutral">{gates ? 'Closed' : 'Ended'}</span>;
  return <span className="badge b-info">Upcoming</span>;
}

export function EventStateBadge({ live, ended, maintenance }: { live: boolean; ended: boolean; maintenance: boolean }) {
  if (maintenance) return <span className="badge b-warn">Maintenance</span>;
  if (live) return <span className="badge b-ok b-live">Live now</span>;
  if (ended) return <span className="badge b-neutral">Ended</span>;
  return <span className="badge b-info">Upcoming</span>;
}
