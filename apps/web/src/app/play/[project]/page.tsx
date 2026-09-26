import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@zemmz/db';
import { playCountry, playGame } from '@zemmz/shared';
import { requireProject, tournamentPhase, PHASE_LABEL, ACTIVE_ENTRY } from '@/lib/play/core';
import { fmt, pct } from '@/lib/format';
import { Icon } from '@/components/icon';

export const metadata: Metadata = { title: 'Dashboard' };

const DAY = 86_400_000;

export default async function PlayDashboard({ params, searchParams }: { params: Promise<{ project: string }>; searchParams: Promise<{ welcome?: string }> }) {
  const { project: slug } = await params;
  const { welcome } = await searchParams;
  const { user, project } = await requireProject(slug);
  const now = Date.now();
  const base = `/play/${slug}`;
  const [players, newNow, newBefore, tournaments, reports, conflicts, pending, byCountry, entriesByGame] = await Promise.all([
    prisma.playPlayer.count({ where: { projectId: project.id } }),
    prisma.playPlayer.count({ where: { projectId: project.id, createdAt: { gte: new Date(now - 30 * DAY) } } }),
    prisma.playPlayer.count({ where: { projectId: project.id, createdAt: { gte: new Date(now - 60 * DAY), lt: new Date(now - 30 * DAY) } } }),
    prisma.tournament.findMany({ where: { projectId: project.id }, orderBy: { startsAt: 'asc' }, include: { _count: { select: { entries: { where: { status: { in: [...ACTIVE_ENTRY] } } } } } } }),
    prisma.match.count({ where: { tournament: { projectId: project.id, status: 'LIVE' }, status: { in: ['REVIEW', 'CONFLICT'] } } }),
    prisma.match.count({ where: { tournament: { projectId: project.id, status: 'LIVE' }, status: 'CONFLICT' } }),
    prisma.playPlayer.count({ where: { projectId: project.id, verification: 'PENDING', blacklisted: false } }),
    prisma.playPlayer.groupBy({ by: ['country'], where: { projectId: project.id }, _count: true, orderBy: { _count: { country: 'desc' } }, take: 5 }),
    prisma.$queryRaw<{ game: string; n: bigint }[]>`SELECT t.game, COUNT(DISTINCT m."playerId") AS n FROM "EntryMember" m JOIN "Entry" e ON e.id = m."entryId" JOIN "Tournament" t ON t.id = e."tournamentId" WHERE t."projectId" = ${project.id} GROUP BY t.game ORDER BY n DESC LIMIT 5`,
  ]);
  const live = tournaments.filter((t) => t.status === 'LIVE');
  const open = tournaments.filter((t) => tournamentPhase(t) === 'reg');
  const closing = open.filter((t) => t.regClosesAt.getTime() - now < 3 * DAY)[0];
  const delta = newBefore ? Math.round(((newNow - newBefore) / newBefore) * 100) : null;
  const hbar = (rows: [string, number][]) => {
    const max = Math.max(1, ...rows.map(([, n]) => n));
    return rows.length ? (
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {rows.map(([l, n]) => (
          <li key={l} className="text-[13px]"><div className="mb-1 flex justify-between"><span>{l}</span><b>{fmt(n)}</b></div><span className="prog block"><i style={{ width: `${(n / max) * 100}%` }} /></span></li>
        ))}
      </ul>
    ) : <p className="m-0 text-[13px] text-muted">Nothing yet.</p>;
  };
  const first = user.name.split(' ')[0];

  return (
    <>
      <div className="ph">
        <div><h1>{welcome ? `Welcome, ${first}` : project.name}</h1><p>Times are in {project.timezone.replace('_', ' ')}. Players sign up at <a href={`/p/${slug}`} target="_blank" rel="noopener">{slug}.zemmz.gg</a>.</p></div>
        <div className="actions"><Link href={`${base}/tournaments/new`} className="btn primary"><Icon name="plus" size={16} /> New tournament</Link></div>
      </div>
      {tournaments.length === 0 && (
        <section className="card card-b mb-4">
          <h2 className="m-0 mb-3 text-[15px] font-semibold">Get your website ready</h2>
          <ol className="m-0 flex list-none flex-col gap-2 p-0 text-[14px]">
            <li><Link href={`${base}/website`}>Set your colours, logo and homepage text</Link></li>
            <li><Link href={`${base}/website?tab=rules`}>Check the rules and FAQ</Link></li>
            <li><Link href={`${base}/tournaments/new`}>Create your first tournament</Link> and publish it: registration opens on its dates</li>
            <li><a href={`/p/${slug}`} target="_blank" rel="noopener">Visit the website</a> and share the link with players</li>
          </ol>
        </section>
      )}
      <div className="mb-4 grid gap-4 md:grid-cols-4">
        <div className="card kpi"><div className="l">New players</div><div className="v">{fmt(newNow)}</div><div className="d">Last 30 days{delta != null && <> · <span className={delta >= 0 ? 'text-ok' : 'text-danger'}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%</span> vs the 30 before</>}</div></div>
        <div className="card kpi"><div className="l">Registered players</div><div className="v">{fmt(players)}</div><div className="d">{fmt(pending)} awaiting review</div></div>
        <div className="card kpi"><div className="l">Live tournaments</div><div className="v">{live.length}</div><div className="d">{open.length} open for registration</div></div>
        <div className="card kpi"><div className="l">Score reports</div><div className="v">{reports}</div><div className="d">{conflicts ? `${conflicts} with scores that don’t match` : 'To confirm'}</div></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="card">
          <div className="card-h"><h2>Live tournaments</h2><div className="r"><Link href={`${base}/tournaments`} className="btn ghost sm">View all</Link></div></div>
          <div className="card-b !pt-1">
            {live.length === 0 ? <p className="m-0 text-muted">Nothing running now. Start a tournament from its page when registration closes.</p> : (
              <table className="tbl !min-w-0"><tbody>
                {live.map((t) => (
                  <tr key={t.id}>
                    <td className="w-[52px] !pl-0"><span className="game-art" style={{ background: `linear-gradient(135deg,${playGame(t.game).c1},${playGame(t.game).c2})` }} /></td>
                    <td><Link href={`${base}/tournaments/${t.slug}`} className="font-semibold">{t.name}</Link><div className="muted text-[12.5px]">{playGame(t.game).name} · round {t.currentRound}</div></td>
                    <td className="w-[160px]"><div className="muted mb-1 text-[12px]">{fmt(t._count.entries)} / {fmt(t.capacity)}</div><span className="prog block"><i style={{ width: `${pct(t._count.entries, t.capacity)}%` }} /></span></td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </div>
        </section>
        <section className="card">
          <div className="card-h"><h2>Needs your attention</h2></div>
          <div className="card-b !pt-1 flex flex-col gap-2 text-[13.5px]">
            {reports > 0 && <Link href={`${base}/tournaments?tab=reports`} className="attn"><Icon name="image" size={17} /> <span><b>{reports} score {reports === 1 ? 'report' : 'reports'} to confirm</b><small className="block text-muted">{conflicts ? `${conflicts} with scores that don’t match` : 'Players are waiting to advance'}</small></span></Link>}
            {pending > 0 && <Link href={`${base}/players?verification=PENDING`} className="attn"><Icon name="shield" size={17} /> <span><b>{pending} {pending === 1 ? 'player' : 'players'} awaiting review</b><small className="block text-muted">Verify them before check-in</small></span></Link>}
            {closing && <Link href={`${base}/tournaments/${closing.slug}`} className="attn"><Icon name="clock" size={17} /> <span><b>Registration closes soon</b><small className="block text-muted">{closing.name} · {closing._count.entries}/{closing.capacity} filled</small></span></Link>}
            {!reports && !pending && !closing && <p className="m-0 text-muted">All caught up.</p>}
          </div>
        </section>
        <section className="card"><div className="card-h"><h2>Players by game</h2></div><div className="card-b">{hbar(entriesByGame.map((r) => [playGame(r.game).name, Number(r.n)]))}</div></section>
        <section className="card"><div className="card-h"><h2>Players by country</h2></div><div className="card-b">{hbar(byCountry.map((r) => [`${playCountry(r.country)?.flag ?? ''} ${playCountry(r.country)?.name ?? (r.country || 'Not given')}`, r._count]))}</div></section>
      </div>
      <p className="mt-4 text-[12.5px] text-muted">Status of every tournament: {Object.entries(tournaments.reduce<Record<string, number>>((m, t) => ((m[tournamentPhase(t)] = (m[tournamentPhase(t)] ?? 0) + 1), m), {})).map(([k, n]) => `${n} ${PHASE_LABEL[k as keyof typeof PHASE_LABEL].en.toLowerCase()}`).join(', ') || 'none yet'}.</p>
    </>
  );
}
