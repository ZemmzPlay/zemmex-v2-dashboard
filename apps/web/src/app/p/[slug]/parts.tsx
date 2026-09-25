import Link from 'next/link';
import { prisma, type Match, type Tournament } from '@zemmz/db';
import { FORMAT_LABEL, formatDate, formatMoney, playGame } from '@zemmz/shared';
import { ACTIVE_ENTRY, matchLabeller, tournamentPhase, type TournamentPhase } from '@/lib/play/core';
import { prizeList } from '@/lib/play/bracket';
import { tName } from '@/lib/play/site';
import type { PlayText } from '@/lib/play/site-text';
import { fileUrl } from '@/lib/storage';

export const PILL: Record<TournamentPhase, string> = { live: 'p-live', reg: 'p-reg', soon: 'p-soon', closed: 'p-soon', ended: 'p-end', cancelled: 'p-end', draft: 'p-soon' };
export const phaseText = (p: TournamentPhase, t: PlayText) => ({ live: t.live, reg: t.reg, soon: t.soon, closed: t.closed, ended: t.ended, cancelled: t.cancelled, draft: t.soon })[p];
export const art = (game: string) => `linear-gradient(135deg,${playGame(game).c1},${playGame(game).c2})`;

export function Ic({ n, s = 15 }: { n: 'cal' | 'trophy' | 'gamepad' | 'clock' | 'users' | 'arrow' | 'upload' | 'check'; s?: number }) {
  const P = {
    trophy: <><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></>,
    cal: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
    users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.2A6.5 6.5 0 0 1 21.5 20" /></>,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    upload: <path d="M12 20V9M7 14l5-5 5 5M4 4h16" />,
    check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
    gamepad: <><rect x="2" y="7" width="20" height="11" rx="5" /><path d="M7 11v3M5.5 12.5h3M15 12h.01M18 13h.01" /></>,
  };
  return <svg className={`i ${n === 'arrow' ? 'flip' : ''}`} viewBox="0 0 24 24" style={{ width: s, height: s }} aria-hidden="true">{P[n]}</svg>;
}

export function prizeLine(t: Tournament, locale: 'en' | 'ar') {
  const list = prizeList(t.prizes);
  const cash = list.reduce((n, p) => n + p.amountMinor, 0);
  if (cash) return formatMoney(cash, t.currency);
  return list[0]?.label || '—';
}

export type CardTournament = Tournament & { _count: { entries: number } };
export async function withCounts(where: object) {
  return prisma.tournament.findMany({ where, orderBy: { startsAt: 'asc' }, include: { _count: { select: { entries: { where: { status: { in: [...ACTIVE_ENTRY] } } } } } } });
}

export function TournamentCard({ x, base, t, locale, banner, expanded }: { x: CardTournament; base: string; t: PlayText; locale: 'en' | 'ar'; banner?: string | null; expanded?: boolean }) {
  const phase = tournamentPhase(x);
  const left = x.capacity - x._count.entries;
  const g = playGame(x.game);
  const href = `${base}/t/${x.slug}`;
  return (
    <article className="tc">
      <div className="art" style={{ background: art(x.game), position: 'relative', overflow: 'hidden' }}>
        {banner && <img src={banner} alt="" className="banner-img" />}
        <span className={`pill ${PILL[phase]}`}>{phaseText(phase, t)}</span>
        <span className="g">{g.name}</span>
      </div>
      <div className="body">
        <h3><Link href={href} style={{ color: 'inherit', textDecoration: 'none' }}>{tName(x, locale)}</Link></h3>
        <div className="meta">
          <span><Ic n="cal" /> {t.startsOn} {formatDate(x.startsAt, x.timezone, locale)}</span>
          <span><Ic n="trophy" /> {prizeLine(x, locale)}</span>
          <span><Ic n="gamepad" /> {x.platform || g.platform}</span>
        </div>
        {phase === 'live' && <div className="meta"><span><Ic n="clock" /> {locale === 'ar' ? `الجولة ${x.currentRound}` : `Round ${x.currentRound}`}</span></div>}
        {(phase === 'reg' || phase === 'closed') && (
          <div>
            <div className="meta" style={{ justifyContent: 'space-between', marginBottom: 6 }}><span>{x._count.entries} / {x.capacity}</span><span>{left > 0 ? t.placesLeft(left) : t.full}</span></div>
            <div className="bar"><i style={{ width: `${Math.min(100, (x._count.entries / x.capacity) * 100)}%` }} /></div>
          </div>
        )}
        <div className="foot">
          {phase === 'reg' && left > 0 && <Link className="btn primary sm" href={`${href}#register`}>{t.register}</Link>}
          <Link className="linkbtn" href={href}>{t.details} <Ic n="arrow" s={16} /></Link>
        </div>
      </div>
      {expanded && <div className="more"><div>{t.format}<b>{FORMAT_LABEL[x.format][locale]}</b></div><div>{phase === 'soon' ? t.regOpens : t.regCloses}<b>{formatDate(phase === 'soon' ? x.regOpensAt : x.regClosesAt, x.timezone, locale)}</b></div></div>}
    </article>
  );
}

export async function bannerUrls(list: Tournament[]) {
  const ids = list.map((x) => x.bannerAssetId).filter(Boolean) as string[];
  const assets = ids.length ? await prisma.asset.findMany({ where: { id: { in: ids } }, select: { id: true, key: true } }) : [];
  return (x: Tournament) => { const a = assets.find((y) => y.id === x.bannerAssetId); return a ? fileUrl(a.key) : null; };
}

/** The bracket as the website shows it: columns by round, confirmed winners highlighted. */
export function PublicBracket({ t, tour, matches, names, locale }: { t: PlayText; tour: Tournament; matches: Match[]; names: Map<string, string>; locale: 'en' | 'ar' }) {
  const label = matchLabeller(tour, matches, locale);
  const cols = new Map<string, Match[]>();
  for (const m of matches) {
    const k = `${['W', 'L', 'F', 'RR', 'S'].indexOf(m.bracket)}-${String(m.round).padStart(3, '0')}`;
    cols.set(k, [...(cols.get(k) ?? []), m]);
  }
  const sorted = [...cols.entries()].sort(([a], [b]) => a.localeCompare(b));
  const brackets = [...new Set(sorted.map(([k]) => k.split('-')[0]))];
  return (
    <>
      {brackets.map((b) => (
        <div key={b} className="bracket" style={{ marginBottom: 24 }}>
          {sorted.filter(([k]) => k.startsWith(`${b}-`)).map(([k, ms]) => (
            <div key={k} className="bcol">
              <h4>{label(ms[0])}</h4>
              {ms.map((m) => {
                const done = m.status === 'CONFIRMED';
                const row = (id: string | null, bye: boolean, sc: number | null) => (
                  <div className={`${done && id && m.winnerId === id ? 'w' : ''} ${!id ? 'pend' : ''}`}><span>{id ? names.get(id) ?? '—' : bye ? t.bye : t.awaiting}</span><span>{done && !m.aBye && !m.bBye ? sc : ''}</span></div>
                );
                return <div key={m.id} className="m">{row(m.entryAId, m.aBye, m.scoreA)}{row(m.entryBId, m.bBye, m.scoreB)}</div>;
              })}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
