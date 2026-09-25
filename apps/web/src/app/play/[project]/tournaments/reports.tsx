import Link from 'next/link';
import { prisma } from '@zemmz/db';
import { formatDate, formatTime } from '@zemmz/shared';
import { matchLabeller } from '@/lib/play/core';
import { REPORT_STATE } from '@/lib/play/reports';
import { fileUrl } from '@/lib/storage';
import { Icon } from '@/components/icon';
import { ConfirmButton, SubmitButton } from '@/components/confirm-button';
import { askForProof, confirmMatch, reopenMatch } from './actions';
import { ResultForm } from './result-form';

export type ReportFilter = 'open' | 'conflict' | 'done';
const OPEN = ['REVIEW', 'CONFLICT', 'PROOF'] as const;

/**
 * The score report queue (docs/prototype play-dashboard, Tournaments, Score
 * reports): the list on the left, the chosen match on the right with every
 * screenshot side by side, the reported scores compared, and the admin's score.
 */
export async function ReportsPanel({ projectId, slug, tz, tournamentId, filter, selected, href, canReopen }: {
  projectId: string; slug: string; tz: string; tournamentId?: string; filter: ReportFilter; selected?: string;
  /** Link to this panel with other query values. */
  href: (q: Record<string, string>) => string;
  canReopen: boolean;
}) {
  const scope = { tournament: { projectId, ...(tournamentId ? { id: tournamentId } : {}), status: { in: ['LIVE', 'ENDED'] as ('LIVE' | 'ENDED')[] } } };
  const where = filter === 'open' ? { ...scope, status: { in: [...OPEN] } } : filter === 'conflict' ? { ...scope, status: 'CONFLICT' as const } : { ...scope, status: 'CONFIRMED' as const, reports: { some: {} } };
  const [list, counts] = await Promise.all([
    prisma.match.findMany({ where, orderBy: filter === 'done' ? { confirmedAt: 'desc' } : [{ round: 'asc' }, { position: 'asc' }], take: 100, include: { tournament: true, reports: { orderBy: { createdAt: 'asc' } } } }),
    Promise.all([
      prisma.match.count({ where: { ...scope, status: { in: [...OPEN] } } }),
      prisma.match.count({ where: { ...scope, status: 'CONFLICT' } }),
      prisma.match.count({ where: { ...scope, status: 'CONFIRMED', reports: { some: {} } } }),
    ]),
  ]);
  const entryIds = [...new Set(list.flatMap((m) => [m.entryAId, m.entryBId]).filter(Boolean) as string[])];
  const assetIds = list.flatMap((m) => m.reports.map((r) => r.screenshotAssetId)).filter(Boolean) as string[];
  const playerIds = [...new Set(list.flatMap((m) => m.reports.map((r) => r.playerId)))];
  const [entries, assets, players] = await Promise.all([
    prisma.entry.findMany({ where: { id: { in: entryIds } }, select: { id: true, name: true } }),
    prisma.asset.findMany({ where: { id: { in: assetIds } }, select: { id: true, key: true } }),
    prisma.playPlayer.findMany({ where: { id: { in: playerIds } }, select: { id: true, gamerTag: true } }),
  ]);
  const name = (id: string | null) => (id ? entries.find((e) => e.id === id)?.name ?? '—' : '—');
  const shot = (id: string | null) => { const a = assets.find((x) => x.id === id); return a ? fileUrl(a.key) : null; };
  const tag = (id: string) => players.find((p) => p.id === id)?.gamerTag ?? 'A player';
  // Round names need every match of each tournament shown.
  const tIds = [...new Set(list.map((m) => m.tournamentId))];
  const rounds = await prisma.match.findMany({ where: { tournamentId: { in: tIds } }, select: { tournamentId: true, bracket: true, round: true } });
  const label = (m: (typeof list)[number]) => matchLabeller(m.tournament, rounds.filter((r) => r.tournamentId === m.tournamentId))(m);

  const current = list.find((m) => m.id === selected) ?? list[0];
  const when = (d: Date) => `${formatDate(d, tz)}, ${formatTime(d, tz)}`;

  const queue = (
    <div className="rq">
      <div className="flex flex-wrap gap-1.5 border-b border-line p-3">
        {([['open', 'To confirm', counts[0]], ['conflict', 'Scores don’t match', counts[1]], ['done', 'Confirmed', counts[2]]] as const).map(([k, l, n]) => (
          <Link key={k} href={href({ f: k })} className="chip" aria-pressed={filter === k}>{l} · {n}</Link>
        ))}
      </div>
      <div className="max-h-[640px] overflow-y-auto">
        {list.length ? list.map((m) => {
          const live = m.reports.filter((r) => !r.replaced);
          const img = shot((live[0] ?? m.reports[m.reports.length - 1])?.screenshotAssetId ?? null);
          return (
            <Link key={m.id} href={href({ f: filter, m: m.id })} className="rq-item" aria-current={m.id === current?.id}>
              {img ? <img src={img} alt="" /> : <span className="grid h-[44px] w-[72px] flex-none place-items-center rounded-md bg-surface-2 text-muted"><Icon name="image" size={16} /></span>}
              <span className="min-w-0 flex-1">
                <b>{name(m.entryAId)} vs {name(m.entryBId)}</b>
                {!tournamentId && <small>{m.tournament.name}</small>}
                <small>{label(m)}</small>
                <span className={`badge ${REPORT_STATE[m.status]?.badge ?? 'b-neutral'} mt-1.5`}>{REPORT_STATE[m.status]?.en ?? m.status}</span>
              </span>
            </Link>
          );
        }) : (
          <div className="empty !py-10"><div className="ic"><Icon name="check" /></div><h3>{filter === 'done' ? 'Nothing confirmed yet' : 'All caught up'}</h3><p>{filter === 'done' ? 'Results you confirm from reports appear here.' : 'New reports appear here as soon as a player uploads a screenshot.'}</p></div>
        )}
      </div>
    </div>
  );
  if (!current) return <div className="rep">{queue}<div className="rd"><div className="empty"><div className="ic"><Icon name="image" /></div><h3>No report selected</h3><p>Choose a report on the left to review it.</p></div></div></div>;

  const a = name(current.entryAId), b = name(current.entryBId);
  const live = current.reports.filter((r) => !r.replaced);
  const earlier = current.reports.filter((r) => r.replaced);
  const disagree = live.length > 1 && live.some((r) => r.scoreA !== live[0].scoreA || r.scoreB !== live[0].scoreB);
  const done = current.status === 'CONFIRMED';
  const sides = new Set(live.map((r) => r.entryId));
  const waiting = [current.entryAId, current.entryBId].filter((e) => e && !sides.has(e)).map(name);
  const knockout = current.tournament.format === 'SINGLE_ELIMINATION' || (current.tournament.format === 'DOUBLE_ELIMINATION' && current.bracket !== 'W');
  const figure = (r: (typeof current.reports)[number]) => {
    const img = shot(r.screenshotAssetId);
    return (
      <figure key={r.id} className="shot">
        {img ? <a href={img} target="_blank" rel="noopener" aria-label={`Open ${tag(r.playerId)}’s screenshot full size`}><img src={img} alt={`Result screenshot uploaded by ${tag(r.playerId)}`} /></a> : <div className="shot missing">No screenshot</div>}
        <figcaption><span><b>{tag(r.playerId)}</b> for {name(r.entryId)}<br /><span className="text-muted">Uploaded {when(r.createdAt)}</span></span><span className="whitespace-nowrap">Reported <b>{r.scoreA}–{r.scoreB}</b></span></figcaption>
      </figure>
    );
  };

  return (
    <div className="rep">
      {queue}
      <div className="rd">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div><div className="text-[12.5px] text-muted">{current.tournament.name} · {label(current)} · best of {current.tournament.bestOf}</div><h2 className="m-0 text-[18px] font-semibold">{a} vs {b}</h2></div>
          <span className={`badge ${REPORT_STATE[current.status]?.badge}`}>{REPORT_STATE[current.status]?.en}</span>
        </div>
        {current.status === 'CONFLICT' && <div className="notice warn mb-4"><Icon name="alert" size={16} /><span><b>The two sides reported different results.</b> Compare the screenshots and enter the score the game actually shows.</span></div>}
        {current.status === 'PROOF' && <div className="notice info mb-4"><Icon name="clock" size={16} /><span><b>You asked for a new screenshot.</b> Both sides were emailed. Their new reports will appear here; you can still enter the result yourself.</span></div>}
        <h3 className="m-0 mb-2.5 text-[14px] font-semibold">Screenshots from players</h3>
        <div className="shots">
          {live.map(figure)}
          {!done && waiting.map((w) => <div key={w} className="shot missing"><div><Icon name="clock" size={22} /><br /><b className="text-ink">{w} hasn’t reported yet</b><br />You can confirm from one screenshot if it’s clear.</div></div>)}
        </div>
        {live.length > 1 && (
          <table className="cmp">
            <thead><tr><th>Reported by</th><th>{a}</th><th>{b}</th><th>Claims winner</th></tr></thead>
            <tbody>{live.map((r) => <tr key={r.id}><td>{tag(r.playerId)}</td><td className={disagree ? 'diff' : ''}>{r.scoreA}</td><td className={disagree ? 'diff' : ''}>{r.scoreB}</td><td>{r.scoreA > r.scoreB ? a : b}</td></tr>)}</tbody>
          </table>
        )}
        <div className="verdict">
          <h3 className="m-0 mb-1 text-[14px] font-semibold">{done ? 'Confirmed result' : 'Enter the score shown in the screenshot'}</h3>
          {done ? (
            <>
              <p className="m-0 mb-3 text-[13px] text-muted">{a} {current.scoreA}–{current.scoreB} {b}. Confirmed by {current.confirmedBy || 'an admin'}{current.confirmedAt ? ` on ${when(current.confirmedAt)}` : ''}.{current.note ? ` Note: ${current.note}` : ''}</p>
              <div className="flex flex-wrap gap-2">
                {canReopen && <ConfirmButton action={reopenMatch.bind(null, slug, current.id)} label="Reopen result" className="btn secondary" title="Reopen this result?" confirmLabel="Reopen result" body={<p className="m-0">The score is cleared and {a} vs {b} goes back to waiting for a result. Only possible while no later match has been played by whoever went through.</p>} />}
                <Link href={`/play/${slug}/tournaments/${current.tournament.slug}?tab=bracket`} className="btn ghost"><Icon name="bracket" size={16} /> View bracket</Link>
              </div>
            </>
          ) : (
            <>
              <p className="m-0 mb-3.5 text-[12.5px] text-muted">The higher score wins. The result is logged against your name.</p>
              <ResultForm key={current.id} action={confirmMatch.bind(null, slug, current.id)} a={a} b={b} initial={live[0] ? [live[0].scoreA, live[0].scoreB] : [null, null]} knockout={knockout} note />
              <div className="mt-3 flex flex-wrap gap-2">
                {current.status !== 'PROOF' && <form action={askForProof.bind(null, slug, current.id)}><SubmitButton className="btn secondary" pendingLabel="Asking…">Ask for a new screenshot</SubmitButton></form>}
                <Link href={`/play/${slug}/tournaments/${current.tournament.slug}?tab=bracket`} className="btn ghost"><Icon name="bracket" size={16} /> View bracket</Link>
              </div>
            </>
          )}
        </div>
        {earlier.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-[13px] text-muted">Earlier screenshots ({earlier.length})</summary>
            <div className="shots mt-3">{earlier.map(figure)}</div>
          </details>
        )}
      </div>
    </div>
  );
}
