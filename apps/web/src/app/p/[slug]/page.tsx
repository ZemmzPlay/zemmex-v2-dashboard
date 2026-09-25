import Link from 'next/link';
import { prisma } from '@zemmz/db';
import { formatDate, formatMoney } from '@zemmz/shared';
import { siteFor, tName } from '@/lib/play/site';
import { tournamentPhase } from '@/lib/play/core';
import { prizeList } from '@/lib/play/bracket';
import { fmt } from '@/lib/format';
import { bannerUrls, Ic, TournamentCard, withCounts } from './parts';

export default async function PlayHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { project, t, locale, base, open } = await siteFor(slug);
  if (!open) return null;
  const [all, players] = await Promise.all([
    withCounts({ projectId: project.id, status: { in: ['PUBLISHED', 'LIVE', 'ENDED'] } }),
    prisma.playPlayer.count({ where: { projectId: project.id, blacklisted: false } }),
  ]);
  const order = { live: 0, reg: 1, closed: 2, soon: 3, ended: 4, cancelled: 5, draft: 6 };
  const featured = [...all].sort((a, b) => order[tournamentPhase(a)] - order[tournamentPhase(b)]).filter((x) => tournamentPhase(x) !== 'ended').slice(0, 3);
  const banner = await bannerUrls(featured);
  // Real figures only: prize money in the currency most tournaments use.
  const currency = all[0]?.currency ?? 'AED';
  const prizes = all.filter((x) => x.currency === currency).reduce((n, x) => n + prizeList(x.prizes).reduce((m, p) => m + p.amountMinor, 0), 0);
  const live = all.find((x) => x.status === 'LIVE');

  return (
    <>
      <div className="hero">
        <div className="grid-bg" />
        <div className="wrap">
          <div>
            {live && <span className="season"><i />{t.live} · {tName(live, locale)}</span>}
            <h1>{project.heroTitle || project.name}</h1>
            {project.heroText && <p>{project.heroText}</p>}
            <div className="ctas">
              <Link className="btn primary" href={`${base}/tournaments`}>{t.browse} <Ic n="arrow" s={18} /></Link>
              <a className="btn onnav" href="#how">{t.how}</a>
            </div>
            {(players > 0 || all.length > 0) && (
              <div className="stats">
                <div><b>{fmt(players)}</b><span>{t.players}</span></div>
                <div><b>{fmt(all.length)}</b><span>{t.tours}</span></div>
                {prizes > 0 && <div><b>{formatMoney(prizes, currency)}</b><span>{t.prize}</span></div>}
              </div>
            )}
          </div>
          <div className="hero-art" aria-hidden="true">
            {featured[0] && <div className="slab s1">{tournamentPhase(featured[0]) === 'live' && <span className="live">{t.live}</span>}{tName(featured[0], locale)}<small>{t.featured}</small></div>}
            {project.countdownAt && <div className="slab s2">{project.countdownLabel}<small>{formatDate(project.countdownAt, project.timezone, locale)}</small></div>}
          </div>
        </div>
      </div>
      <section className="tsec">
        <div className="wrap">
          <div className="sec-h"><div><h2>{t.featured}</h2><p>{t.featuredP}</p></div><div className="r"><Link className="linkbtn" href={`${base}/tournaments`}>{t.all} <Ic n="arrow" s={16} /></Link></div></div>
          {featured.length ? <div className="tgrid">{featured.map((x) => <TournamentCard key={x.id} x={x} base={base} t={t} locale={locale} banner={banner(x)} expanded />)}</div> : <div className="panel" style={{ textAlign: 'center', padding: 40 }}>{t.noneYet}</div>}
        </div>
      </section>
      <section id="how">
        <div className="wrap">
          <div className="sec-h"><h2>{t.howT}</h2></div>
          <div className="how">{t.steps.map(([h, p], i) => <div key={h}><span className="n">{i + 1}</span><h3>{h}</h3><p>{p}</p></div>)}</div>
        </div>
      </section>
      {project.sponsors.length > 0 && (
        <section className="sponsors"><div className="wrap"><div className="sec-h"><h2>{t.sponsors}</h2></div><div className="sp-row">{project.sponsors.map((s) => <div key={s} className="sp">{s}</div>)}</div></div></section>
      )}
    </>
  );
}
