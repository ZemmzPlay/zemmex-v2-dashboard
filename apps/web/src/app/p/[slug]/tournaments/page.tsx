import type { Metadata } from 'next';
import Link from 'next/link';
import { PLAY_GAMES } from '@zemmz/shared';
import { siteFor } from '@/lib/play/site';
import { tournamentPhase } from '@/lib/play/core';
import { bannerUrls, TournamentCard, withCounts } from '../parts';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { t } = await siteFor((await params).slug);
  return { title: t.nav.tournaments };
}

export default async function List({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ game?: string; status?: string }> }) {
  const { slug } = await params;
  const { game = 'all', status = 'all' } = await searchParams;
  const { project, t, locale, base } = await siteFor(slug);
  const all = await withCounts({ projectId: project.id, status: { in: ['PUBLISHED', 'LIVE', 'ENDED'] } });
  const games = PLAY_GAMES.filter((g) => all.some((x) => x.game === g.key));
  const rows = all.filter((x) => (game === 'all' || x.game === game) && (status === 'all' || tournamentPhase(x) === status || (status === 'soon' && tournamentPhase(x) === 'closed')));
  rows.sort((a, b) => (tournamentPhase(a) === 'ended' ? 1 : 0) - (tournamentPhase(b) === 'ended' ? 1 : 0) || a.startsAt.getTime() - b.startsAt.getTime());
  const banner = await bannerUrls(rows);
  const q = (k: string, v: string) => `${base}/tournaments?${new URLSearchParams({ game, status, [k]: v })}`;
  return (
    <section>
      <div className="wrap">
        <div className="sec-h"><div><h2>{t.nav.tournaments}</h2><p>{t.featuredP}</p></div></div>
        {games.length > 1 && <div className="filters" role="group" aria-label="Game">{[['all', t.allGames], ...games.map((g) => [g.key, g.name])].map(([k, l]) => <Link key={k} className="chip" href={q('game', k)} aria-pressed={game === k}>{l}</Link>)}</div>}
        <div className="filters" role="group" aria-label="Status">{[['all', t.allStatus], ['live', t.live], ['reg', t.reg], ['soon', t.soon], ['ended', t.ended]].map(([k, l]) => <Link key={k} className="chip" href={q('status', k)} aria-pressed={status === k}>{l}</Link>)}</div>
        {rows.length ? <div className="tgrid">{rows.map((x) => <TournamentCard key={x.id} x={x} base={base} t={t} locale={locale} banner={banner(x)} />)}</div> : <div className="panel" style={{ textAlign: 'center', padding: 48 }}>{all.length ? t.noMatch : t.noneYet}</div>}
      </div>
    </section>
  );
}
