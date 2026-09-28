import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@zemmz/db';
import { dayKey, formatMoney, playCountry, playGame } from '@zemmz/shared';
import { requireProject } from '@/lib/play/core';
import { fmt, pct } from '@/lib/format';
import { UrlSelect } from '@/components/url-select';

export const metadata: Metadata = { title: 'Analytics' };

const DAY = 86_400_000;
const TABS: [string, string][] = [['tournaments', 'Tournaments'], ['players', 'Players'], ['devices', 'Devices and sign-in']];

/** Change against the previous period, as a KPI line. */
function Delta({ now, before, label, lowerIsBetter }: { now: number; before: number; label: string; lowerIsBetter?: boolean }) {
  if (!before) return <div className="d">{now ? `None in the ${label}` : `Nothing yet`}</div>;
  const d = Math.round(((now - before) / before) * 100);
  const good = lowerIsBetter ? d <= 0 : d >= 0;
  return <div className="d"><span className={`delta ${good ? 'up' : 'text-danger'}`}>{d >= 0 ? '▲' : '▼'} {Math.abs(d)}%</span> vs the {label}</div>;
}

function Bars({ rows, empty = 'Nothing yet.' }: { rows: [string, number][]; empty?: string }) {
  const max = Math.max(1, ...rows.map(([, n]) => n));
  return rows.length ? (
    <div className="hbar">{rows.map(([l, n]) => <div className="r" key={l}><span className="truncate">{l}</span><span className="t"><i style={{ width: `${(n / max) * 100}%` }} /></span><span className="n">{fmt(n)}</span></div>)}</div>
  ) : <p className="m-0 text-[13px] text-muted">{empty}</p>;
}

/** This period against the one before, per day (per week for 90 days). */
function Line({ current, previous, labels }: { current: number[]; previous: number[]; labels: string[] }) {
  const W = 640, H = 180, P = 8;
  const max = Math.max(1, ...current, ...previous);
  const x = (i: number) => P + (i * (W - 2 * P)) / Math.max(1, current.length - 1);
  const y = (v: number) => H - P - (v / max) * (H - 2 * P);
  const path = (v: number[]) => v.map((n, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(n).toFixed(1)}`).join(' ');
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[180px] w-full" role="img" aria-label={`This period: ${current.join(', ')}. Previous period: ${previous.join(', ')}.`} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={P} x2={W - P} y1={P + f * (H - 2 * P)} y2={P + f * (H - 2 * P)} stroke="var(--line)" strokeWidth="1" />)}
        <path d={`${path(current)} L${x(current.length - 1)},${H - P} L${x(0)},${H - P} Z`} fill="color-mix(in srgb, var(--brand) 12%, transparent)" />
        <path d={path(previous)} fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <path d={path(current)} fill="none" stroke="var(--brand)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-muted"><span>{labels[0]}</span><span>{labels[Math.floor(labels.length / 2)]}</span><span>{labels[labels.length - 1]}</span></div>
      <div className="mt-2 flex gap-4 text-[12px] text-muted"><span className="flex items-center gap-1.5"><i className="inline-block h-[3px] w-4 rounded bg-brand" /> This period</span><span className="flex items-center gap-1.5"><i className="inline-block h-0 w-4 border-t-2 border-dashed border-muted" /> Previous period</span></div>
    </div>
  );
}

export default async function Analytics({ params, searchParams }: { params: Promise<{ project: string }>; searchParams: Promise<{ tab?: string; range?: string }> }) {
  const { project: slug } = await params;
  const sp = await searchParams;
  const { project } = await requireProject(slug);
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : 'tournaments';
  const days = [7, 30, 90].includes(Number(sp.range)) ? Number(sp.range) : 30;
  const now = Date.now();
  const from = new Date(now - days * DAY), before = new Date(now - 2 * days * DAY);
  const label = `previous ${days} days`;
  const base = `/play/${slug}/analytics`;
  const tz = project.timezone;
  const P = { projectId: project.id };

  let body: React.ReactNode;
  if (tab === 'tournaments') {
    const [regNow, regBefore, playedNow, playedBefore, started, feesNow, feesBefore, byGame] = await Promise.all([
      prisma.entry.count({ where: { tournament: P, createdAt: { gte: from } } }),
      prisma.entry.count({ where: { tournament: P, createdAt: { gte: before, lt: from } } }),
      prisma.match.count({ where: { tournament: P, status: 'CONFIRMED', aBye: false, bBye: false, confirmedAt: { gte: from } } }),
      prisma.match.count({ where: { tournament: P, status: 'CONFIRMED', aBye: false, bBye: false, confirmedAt: { gte: before, lt: from } } }),
      prisma.tournament.findMany({ where: { ...P, startedAt: { gte: before } }, select: { startedAt: true, capacity: true, checkIn: true, _count: { select: { entries: { where: { status: { in: ['REGISTERED', 'CHECKED_IN'] } } } } } } }),
      prisma.entryOrder.aggregate({ where: { tournament: P, status: { in: ['PAID', 'PARTIALLY_REFUNDED'] }, paidAt: { gte: from } }, _sum: { amountMinor: true } }),
      prisma.entryOrder.aggregate({ where: { tournament: P, status: { in: ['PAID', 'PARTIALLY_REFUNDED'] }, paidAt: { gte: before, lt: from } }, _sum: { amountMinor: true } }),
      prisma.$queryRaw<{ game: string; n: bigint }[]>`SELECT t.game, COUNT(*)::bigint AS n FROM "Entry" e JOIN "Tournament" t ON t.id = e."tournamentId" WHERE t."projectId" = ${project.id} AND e."createdAt" >= (${from}::timestamptz AT TIME ZONE 'UTC') GROUP BY t.game ORDER BY n DESC`,
    ]);
    const fill = (list: typeof started) => (list.length ? Math.round(list.reduce((n, t) => n + pct(t._count.entries, t.capacity), 0) / list.length) : null);
    const fillNow = fill(started.filter((t) => t.startedAt! >= from)), fillBefore = fill(started.filter((t) => t.startedAt! < from));
    const currency = (await prisma.tournament.findFirst({ where: { ...P, entryFeeMinor: { gt: 0 } }, select: { currency: true } }))?.currency ?? 'AED';
    body = (
      <>
        <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="card kpi"><div className="l">Registrations</div><div className="v">{fmt(regNow)}</div><Delta now={regNow} before={regBefore} label={label} /></div>
          <div className="card kpi"><div className="l">Matches played</div><div className="v">{fmt(playedNow)}</div><Delta now={playedNow} before={playedBefore} label={label} /></div>
          <div className="card kpi"><div className="l">Average fill rate</div><div className="v">{fillNow == null ? '—' : `${fillNow}%`}</div><div className="d">{fillNow == null ? 'No tournaments started in this period' : fillBefore == null ? 'Of places, in tournaments that started' : <><span className={`delta ${fillNow >= fillBefore ? 'up' : 'text-danger'}`}>{fillNow >= fillBefore ? '▲' : '▼'} {Math.abs(fillNow - fillBefore)} pts</span> vs the {label}</>}</div></div>
          <div className="card kpi"><div className="l">Entry fees</div><div className="v">{formatMoney(feesNow._sum.amountMinor ?? 0, currency)}</div><Delta now={feesNow._sum.amountMinor ?? 0} before={feesBefore._sum.amountMinor ?? 0} label={label} /></div>
        </div>
        <section className="card"><div className="card-h"><h2>Registrations by game</h2><span className="sub">Last {days} days</span></div><div className="card-b"><Bars rows={byGame.map((r) => [playGame(r.game).name, Number(r.n)])} empty="No registrations in this period." /></div></section>
      </>
    );
  } else if (tab === 'players') {
    const [joined, verifiedNow, verifiedBefore, active, returning, byCountry] = await Promise.all([
      prisma.playPlayer.findMany({ where: { ...P, createdAt: { gte: before } }, select: { createdAt: true } }),
      prisma.playPlayer.count({ where: { ...P, verification: 'VERIFIED', createdAt: { gte: from } } }),
      prisma.playPlayer.count({ where: { ...P, verification: 'VERIFIED', createdAt: { gte: before, lt: from } } }),
      prisma.playerSession.findMany({ where: { player: P, createdAt: { gte: from } }, select: { playerId: true }, distinct: ['playerId'] }),
      prisma.playerSession.findMany({ where: { player: { ...P, createdAt: { lt: from } }, createdAt: { gte: from } }, select: { playerId: true }, distinct: ['playerId'] }),
      prisma.playPlayer.groupBy({ by: ['country'], where: { ...P, createdAt: { gte: from } }, _count: true, orderBy: { _count: { country: 'desc' } }, take: 8 }),
    ]);
    // Per day, or per week over 90 days, in the website's timezone.
    const step = days === 90 ? 7 : 1;
    const buckets = Math.ceil(days / step);
    const idx = (d: Date, start: Date) => Math.floor((new Date(dayKey(d, tz)).getTime() - new Date(dayKey(start, tz)).getTime()) / (step * DAY));
    const current = Array(buckets).fill(0), previous = Array(buckets).fill(0);
    for (const p of joined) {
      if (p.createdAt >= from) { const i = idx(p.createdAt, from); if (i >= 0 && i < buckets) current[i]++; }
      else { const i = idx(p.createdAt, before); if (i >= 0 && i < buckets) previous[i]++; }
    }
    const labels = Array.from({ length: buckets }, (_, i) => new Date(from.getTime() + i * step * DAY).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: tz }));
    const newNow = joined.filter((p) => p.createdAt >= from).length, newBefore = joined.length - newNow;
    body = (
      <>
        <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="card kpi"><div className="l">New players</div><div className="v">{fmt(newNow)}</div><Delta now={newNow} before={newBefore} label={label} /></div>
          <div className="card kpi"><div className="l">Signed in</div><div className="v">{fmt(active.length)}</div><div className="d">Players who signed in in the last {days} days</div></div>
          <div className="card kpi"><div className="l">Returning players</div><div className="v">{active.length ? `${pct(returning.length, active.length)}%` : '—'}</div><div className="d">Of those, joined before this period</div></div>
          <div className="card kpi"><div className="l">Verified players</div><div className="v">{fmt(verifiedNow)}</div><Delta now={verifiedNow} before={verifiedBefore} label={label} /></div>
        </div>
        <section className="card mb-4"><div className="card-h"><h2>New players</h2><span className="sub">{step === 7 ? 'Per week' : 'Per day'}, {tz.replace('_', ' ')}</span></div><div className="card-b"><Line current={current} previous={previous} labels={labels} /></div></section>
        <section className="card"><div className="card-h"><h2>New players by country</h2></div><div className="card-b"><Bars rows={byCountry.map((r) => [`${playCountry(r.country)?.flag ?? ''} ${playCountry(r.country)?.name ?? (r.country || 'Not given')}`, r._count])} /></div></section>
      </>
    );
  } else {
    const sessions = await prisma.playerSession.groupBy({ by: ['device', 'method'], where: { player: P, createdAt: { gte: from } }, _count: true });
    const sum = (k: 'device' | 'method', v: string) => sessions.filter((s) => s[k] === v).reduce((n, s) => n + s._count, 0);
    const total = sessions.reduce((n, s) => n + s._count, 0);
    const known = sessions.filter((s) => s.device).reduce((n, s) => n + s._count, 0);
    body = (
      <>
        <p className="mt-0 text-[13px] text-muted">From each player sign-in in the last {days} days: the kind of device their browser reported and how they signed in. {total - known > 0 ? `${fmt(total - known)} older sign-ins didn’t record a device.` : ''}</p>
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card"><div className="card-h"><h2>Devices</h2><span className="sub">{fmt(known)} sign-ins</span></div><div className="card-b"><Bars rows={([['Mobile', sum('device', 'mobile')], ['Desktop', sum('device', 'desktop')], ['Tablet', sum('device', 'tablet')]] as [string, number][]).filter(([, n]) => n)} empty="No sign-ins in this period." /></div></section>
          <section className="card"><div className="card-h"><h2>How players sign in</h2><span className="sub">{fmt(total)} sign-ins</span></div><div className="card-b"><Bars rows={([['Email code', sum('method', 'email')], ['Text message code', sum('method', 'phone')], ['Google', sum('method', 'google')], ['Discord', sum('method', 'discord')]] as [string, number][]).filter(([, n]) => n)} empty="No sign-ins in this period." /></div></section>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="ph">
        <div><h1>Analytics</h1><p>From registrations, results and sign-ins on {project.name}. Times in {tz.replace('_', ' ')}.</p></div>
        <div className="actions"><UrlSelect param="range" label="Date range" value={String(days)} options={[['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days']]} /></div>
      </div>
      <nav className="tabs" aria-label="Analytics">{TABS.map(([k, l]) => <Link key={k} href={`${base}?tab=${k}&range=${days}`} aria-current={tab === k ? 'page' : undefined}>{l}</Link>)}</nav>
      {body}
    </>
  );
}
