import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@zemmz/db';
import { formatDate, formatTime, localise } from '@zemmz/shared';
import { siteFor } from '@/lib/play/site';
import { currentPlayer } from '@/lib/play/players';
import { CHECK_IN_MINUTES, checkInOpen } from '@/lib/play/entries';
import { matchLabeller } from '@/lib/play/core';
import { art } from '../parts';
import { checkInAction, payAgain, signOut, withdrawAction } from '../actions';
import { ReportForm } from '../report-form';
import { SiteConfirm } from '../site-confirm';

export const metadata: Metadata = { robots: { index: false } };

export default async function MyMatches({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ registered?: string; withdrawn?: string; error?: string; payment?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { project, t, locale, base } = await siteFor(slug);
  const player = await currentPlayer(project.id);
  if (!player) redirect(`${base}/signin?next=${encodeURIComponent(`${base}/me`)}`);
  const memberships = await prisma.entryMember.findMany({
    where: { playerId: player.id, entry: { status: { in: ['PENDING_PAYMENT', 'REGISTERED', 'CHECKED_IN', 'DISQUALIFIED'] }, tournament: { status: { not: 'DRAFT' } } } },
    include: { entry: { include: { tournament: true, members: { include: { player: { select: { gamerTag: true } } } } } } },
    orderBy: { entry: { tournament: { startsAt: 'desc' } } },
  });
  const entryIds = memberships.map((m) => m.entryId);
  const [matches, reports] = await Promise.all([
    prisma.match.findMany({ where: { OR: [{ entryAId: { in: entryIds } }, { entryBId: { in: entryIds } }], aBye: false, bBye: false }, orderBy: [{ round: 'asc' }] }),
    prisma.scoreReport.findMany({ where: { entryId: { in: entryIds }, replaced: false } }),
  ]);
  const allMatchIds = [...new Set(matches.map((m) => m.tournamentId))];
  const [rounds, names] = await Promise.all([
    prisma.match.findMany({ where: { tournamentId: { in: allMatchIds } }, select: { tournamentId: true, bracket: true, round: true } }),
    prisma.entry.findMany({ where: { id: { in: [...new Set(matches.flatMap((m) => [m.entryAId, m.entryBId]).filter(Boolean) as string[])] } }, select: { id: true, name: true } }),
  ]);
  const nm = (id: string | null) => names.find((e) => e.id === id)?.name ?? '—';
  const status = (s: string) => ({ REVIEW: t.waitingAdmin, CONFLICT: t.conflict, PROOF: t.proofAsked })[s];
  const rt = { reportT: t.reportT, reportSub: t.reportSub, shot: t.shot, drop: t.drop, replace: t.replace, submitReport: t.submitReport, cancel: t.cancel, report: t.report };

  return (
    <section>
      <div className="wrap" style={{ maxWidth: 860 }}>
        <div className="sec-h"><div><h2>{t.myMatches}</h2><p>{t.welcome(player.gamerTag)}</p></div><div className="r"><form action={signOut.bind(null, slug)}><button className="btn ghost sm">{t.signout}</button></form></div></div>
        {sp.error && <div className="notice err" role="alert">{sp.error}</div>}
        {sp.withdrawn && <div className="notice info" role="status">{t.withdrawn}</div>}
        {sp.payment === 'paid' && <div className="notice ok" role="status">{t.paid}</div>}
        {sp.payment === 'failed' && <div className="notice err" role="alert">{t.payFailed}</div>}
        {sp.payment === 'cancelled' && <div className="notice info" role="status">{t.payCancelled}</div>}
        {sp.payment === 'pending' && <div className="notice info" role="status">{t.payPending}</div>}
        {memberships.length === 0 && <div className="panel" style={{ textAlign: 'center', padding: 40 }}><p style={{ marginTop: 0 }}>{t.noEntries}</p><Link className="btn primary" href={`${base}/tournaments`}>{t.browse}</Link></div>}
        {memberships.map(({ entry: e }) => {
          const x = e.tournament;
          const lx = localise(x, locale);
          const label = matchLabeller(x, rounds.filter((r) => r.tournamentId === x.id), locale);
          const mine = matches.filter((m) => m.tournamentId === x.id && (m.entryAId === e.id || m.entryBId === e.id));
          const open = mine.filter((m) => m.status !== 'CONFIRMED' && m.status !== 'PENDING' && m.entryAId && m.entryBId);
          const played = mine.filter((m) => m.status === 'CONFIRMED');
          const captain = e.captainId === player.id;
          const lostOut = x.status === 'LIVE' && !open.length && !mine.some((m) => m.status === 'PENDING');
          return (
            <div key={e.id} style={{ marginBottom: 22 }}>
              <div className="match-card">
                <div style={{ width: 54, height: 54, borderRadius: 12, background: art(x.game), flex: 'none' }} />
                <div className="teams">
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>{formatDate(x.startsAt, x.timezone, locale)}, {formatTime(x.startsAt, x.timezone, locale)}</div>
                  <b><Link href={`${base}/t/${x.slug}`} style={{ color: 'inherit' }}>{lx.name}</Link></b>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                    {e.name}{x.teamSize > 1 ? ` · ${t.members(e.members.length, x.teamSize)}` : ''}
                    {x.teamSize > 1 && captain && e.joinCode && x.status === 'PUBLISHED' ? <> · {t.teamCodeLine('')}<span className="code" style={{ fontSize: 13, padding: '2px 8px' }}>{e.joinCode}</span></> : null}
                  </div>
                </div>
                {e.status === 'DISQUALIFIED' ? <span className="status s-todo">{t.cancelled}</span>
                  : x.status === 'ENDED' ? <span className="status s-ok">{e.place ? t.placeLine(t.place(e.place)) : t.ended}</span>
                  : e.status === 'CHECKED_IN' ? <span className="status s-ok">{t.checkedIn}</span>
                  : e.status === 'PENDING_PAYMENT' ? <span className="status s-wait">{t.payRetry}</span>
                  : x.status === 'LIVE' ? <span className="status s-ok">{t.live}</span>
                  : <span className="status s-ok">{t.youreIn}</span>}
              </div>
              {x.status === 'PUBLISHED' && e.status !== 'DISQUALIFIED' && (
                <div className="me-actions">
                  {e.status === 'PENDING_PAYMENT' && <form action={payAgain.bind(null, slug, x.slug)}><button className="btn primary sm">{t.payRetry}</button></form>}
                  {x.checkIn && e.status === 'REGISTERED' && (checkInOpen(x) ? <form action={checkInAction.bind(null, slug, x.slug)}><button className="btn primary sm">{t.checkInBtn}</button></form> : <span style={{ fontSize: 13, color: 'var(--muted)', alignSelf: 'center' }}>{t.checkInLater(`${formatDate(new Date(x.startsAt.getTime() - CHECK_IN_MINUTES * 60_000), x.timezone, locale)}, ${formatTime(new Date(x.startsAt.getTime() - CHECK_IN_MINUTES * 60_000), x.timezone, locale)}`)}</span>)}
                  <SiteConfirm action={withdrawAction.bind(null, slug, x.slug)} label={t.withdrawBtn} title={t.withdrawQ} body={`${captain && x.teamSize > 1 ? t.withdrawCaptain : t.withdrawSolo}${captain && x.entryFeeMinor ? ` ${t.withdrawRefund}` : ''}`} confirm={t.withdrawBtn} keep={t.keep} />
                </div>
              )}
              {x.status === 'LIVE' && open.map((m) => {
                const mineA = m.entryAId === e.id;
                const rep = reports.find((r) => r.matchId === m.id && r.entryId === e.id);
                return (
                  <div key={m.id} className="match-card" style={{ marginTop: 10, flexWrap: 'wrap' }}>
                    <div className="teams">
                      <div style={{ fontSize: 13, color: 'var(--muted)' }}>{label(m)} · {t.bestOf(x.bestOf)}</div>
                      <b>{nm(m.entryAId)}{mineA ? ` (${t.you})` : ''}</b> <span style={{ color: 'var(--muted)' }}>{t.vs}</span> <b>{nm(m.entryBId)}{!mineA ? ` (${t.you})` : ''}</b>
                      {rep && m.status !== 'PROOF' && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{t.reportedYou(rep.scoreA, rep.scoreB)}</div>}
                    </div>
                    {rep && m.status !== 'PROOF' ? <span className="status s-wait">{status(m.status) ?? t.waitingAdmin}</span>
                      : !x.playersReport ? <span className="status s-todo">{t.waitingAdmin}</span>
                      : <>{m.status === 'PROOF' ? <span className="status s-wait">{t.proofAsked}</span> : <span className="status s-todo">{t.resultNeeded}</span>}<ReportForm endpoint={`${base}/report`} matchId={m.id} a={nm(m.entryAId)} b={nm(m.entryBId)} t={rt} /></>}
                  </div>
                );
              })}
              {x.status === 'LIVE' && !mine.length && <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: '10px 4px 0' }}>{t.noMatchYet}</p>}
              {lostOut && mine.length > 0 && <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: '10px 4px 0' }}>{t.eliminated}</p>}
              {played.map((m) => (
                <div key={m.id} className="match-card" style={{ marginTop: 10, opacity: 0.85 }}>
                  <div className="teams"><div style={{ fontSize: 13, color: 'var(--muted)' }}>{label(m)}</div><b>{nm(m.entryAId)}</b> {m.scoreA} – {m.scoreB} <b>{nm(m.entryBId)}</b></div>
                  <span className={`status ${m.winnerId === e.id ? 's-ok' : 's-todo'}`}>{m.winnerId === e.id ? t.won : t.lost}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
