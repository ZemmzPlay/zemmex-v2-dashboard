import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma, type Prisma } from '@zemmz/db';
import { FORMAT_LABEL, formatDate, playGame } from '@zemmz/shared';
import { ACTIVE_ENTRY, PHASE_LABEL, playCan, requireProject, tournamentPhase, type TournamentPhase } from '@/lib/play/core';
import { fmt, pct } from '@/lib/format';
import { Icon } from '@/components/icon';
import { SearchBox } from '@/components/search-box';
import { UrlSelect } from '@/components/url-select';
import { ReportsPanel, type ReportFilter } from './reports';

export const metadata: Metadata = { title: 'Tournaments' };

const STATUS: [string, string][] = [['', 'All statuses'], ['live', 'Live'], ['reg', 'Registration open'], ['upcoming', 'Coming up'], ['draft', 'Drafts'], ['ended', 'Ended']];

export default async function Tournaments({ params, searchParams }: { params: Promise<{ project: string }>; searchParams: Promise<{ tab?: string; q?: string; status?: string; f?: string; m?: string }> }) {
  const { project: slug } = await params;
  const sp = await searchParams;
  const { user, project } = await requireProject(slug);
  const moderatorOnly = !playCan.runTournaments(user.role);
  const tab = moderatorOnly || sp.tab === 'reports' ? 'reports' : 'all';
  const base = `/play/${slug}/tournaments`;
  const [total, open] = await Promise.all([
    prisma.tournament.count({ where: { projectId: project.id } }),
    prisma.match.count({ where: { tournament: { projectId: project.id, status: 'LIVE' }, status: { in: ['REVIEW', 'CONFLICT', 'PROOF'] } } }),
  ]);

  return (
    <>
      <div className="ph">
        <div><h1>{tab === 'reports' && moderatorOnly ? 'Score reports' : 'Tournaments'}</h1><p>{tab === 'reports' ? 'Check the screenshots players upload and confirm who goes through.' : 'Create tournaments, run brackets and confirm results.'}</p></div>
        {!moderatorOnly && tab === 'all' && (
          <div className="actions">
            {total > 0 && <a href={`/play/${slug}/export/tournaments`} className="btn secondary"><Icon name="download" size={16} /> Download</a>}
            <Link href={`${base}/new`} className="btn primary"><Icon name="plus" size={16} /> New tournament</Link>
          </div>
        )}
      </div>
      {!moderatorOnly && (
        <nav className="tabs" aria-label="Tournaments">
          <Link href={base} aria-current={tab === 'all' ? 'page' : undefined}>All tournaments <span className="n">{total}</span></Link>
          <Link href={`${base}?tab=reports`} aria-current={tab === 'reports' ? 'page' : undefined}>Score reports <span className="n">{open}</span></Link>
        </nav>
      )}
      {tab === 'reports' ? (
        <ReportsPanel
          projectId={project.id} slug={slug} tz={project.timezone} filter={(['open', 'conflict', 'done'].includes(sp.f ?? '') ? sp.f : 'open') as ReportFilter} selected={sp.m}
          href={(q) => `${base}?${new URLSearchParams({ tab: 'reports', ...q })}`} canReopen={!moderatorOnly}
        />
      ) : (
        <List projectId={project.id} slug={slug} tz={project.timezone} q={sp.q ?? ''} status={sp.status ?? ''} total={total} />
      )}
    </>
  );
}

async function List({ projectId, slug, tz, q, status, total }: { projectId: string; slug: string; tz: string; q: string; status: string; total: number }) {
  const now = new Date();
  const where: Prisma.TournamentWhereInput = { projectId };
  if (q) where.name = { contains: q, mode: 'insensitive' };
  if (status === 'live') where.status = 'LIVE';
  else if (status === 'ended') where.status = { in: ['ENDED', 'CANCELLED'] };
  else if (status === 'draft') where.status = 'DRAFT';
  else if (status === 'reg') Object.assign(where, { status: 'PUBLISHED', regOpensAt: { lte: now }, regClosesAt: { gte: now } });
  else if (status === 'upcoming') Object.assign(where, { status: 'PUBLISHED', OR: [{ regOpensAt: { gt: now } }, { regClosesAt: { lt: now } }] });
  const rows = await prisma.tournament.findMany({
    where, orderBy: [{ startsAt: 'desc' }], take: 200,
    include: {
      _count: { select: { entries: { where: { status: { in: [...ACTIVE_ENTRY] } } }, matches: { where: { status: { in: ['REVIEW', 'CONFLICT'] } } } } },
      matches: { select: { round: true, bracket: true }, orderBy: { round: 'desc' }, take: 1, where: { bracket: { in: ['W', 'RR', 'S'] } } },
    },
  });
  const next = (t: (typeof rows)[number], phase: TournamentPhase) => {
    if (phase === 'draft') return 'Publish to open registration on its dates';
    if (phase === 'soon') return `Registration opens ${formatDate(t.regOpensAt, tz)}`;
    if (phase === 'reg') return `Registration closes ${formatDate(t.regClosesAt, tz)}`;
    if (phase === 'closed') return `Start the bracket (${formatDate(t.startsAt, tz)})`;
    if (phase === 'live') return t._count.matches ? `${t._count.matches} ${t._count.matches === 1 ? 'result' : 'results'} to confirm` : 'Waiting for results';
    if (phase === 'ended') return 'Pay out the prizes';
    return '—';
  };

  if (!total) {
    return (
      <div className="card empty"><div className="ic"><Icon name="trophy" /></div><h3>No tournaments yet</h3><p>Create a tournament, publish it, and players can register on your website on its dates.</p><Link href={`/play/${slug}/tournaments/new`} className="btn primary"><Icon name="plus" size={16} /> New tournament</Link></div>
    );
  }
  return (
    <>
      <div className="toolbar">
        <SearchBox placeholder="Search by name" label="Search tournaments" />
        <UrlSelect param="status" label="Status" options={STATUS} value={status} />
      </div>
      <div className="tbl-wrap">
        {rows.length ? (
          <table className="tbl">
            <thead><tr><th>Tournament</th><th>Status</th><th>Progress</th><th>What’s next</th><th>Entrants</th></tr></thead>
            <tbody>
              {rows.map((t) => {
                const g = playGame(t.game);
                const phase = tournamentPhase(t, now);
                const rounds = t.matches[0]?.round ?? 0;
                return (
                  <tr key={t.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="game-art" style={{ background: `linear-gradient(135deg,${g.c1},${g.c2})` }} aria-hidden />
                        <div><Link href={`/play/${slug}/tournaments/${t.slug}`} className="font-semibold">{t.name}</Link><div className="muted text-[12.5px]">{g.name} · {FORMAT_LABEL[t.format].en}{t.teamSize > 1 ? ` · teams of ${t.teamSize}` : ''}</div></div>
                      </div>
                    </td>
                    <td><span className={`badge ${PHASE_LABEL[phase].badge}`}>{PHASE_LABEL[phase].en}</span></td>
                    <td className="min-w-[130px]">
                      {phase === 'live' || phase === 'ended' ? (
                        <><div className="muted mb-1 text-[12px]">Round {t.currentRound || rounds} of {rounds}</div><span className="prog block"><i style={{ width: `${pct(t.currentRound || rounds, rounds)}%` }} /></span></>
                      ) : <span className="muted text-[13px]">Starts {formatDate(t.startsAt, tz)}</span>}
                    </td>
                    <td className="text-[13px]">{next(t, phase)}</td>
                    <td className="whitespace-nowrap">{fmt(t._count.entries)} <span className="muted">/ {fmt(t.capacity)}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="empty"><div className="ic"><Icon name="search" /></div><h3>No tournaments match</h3><p>Try a different search or status.</p><Link href={`/play/${slug}/tournaments`} className="btn secondary">Clear filters</Link></div>
        )}
      </div>
    </>
  );
}
