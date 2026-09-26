import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@zemmz/db';
import { FORMAT_LABEL, formatDate, formatMoney, formatTime, localise, playCountry, playGame, sanitizeRichText } from '@zemmz/shared';
import { siteFor, tName } from '@/lib/play/site';
import { ACTIVE_ENTRY, tournamentPhase } from '@/lib/play/core';
import { prizeList } from '@/lib/play/bracket';
import { CHECK_IN_MINUTES, entryBlock, entryPrice } from '@/lib/play/entries';
import { currentPlayer } from '@/lib/play/players';
import { fileUrl } from '@/lib/storage';
import { Ic, PILL, phaseText, prizeLine, PublicBracket } from '../../parts';
import { SiteForm } from '../../site-form';
import { joinTeamAction, payAgain, registerAction } from '../../actions';

async function load(slug: string, tSlug: string) {
  const s = await siteFor(slug);
  const x = await prisma.tournament.findUnique({ where: { projectId_slug: { projectId: s.project.id, slug: tSlug } } });
  if (!x || x.status === 'DRAFT') notFound();
  return { ...s, x };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; t: string }> }): Promise<Metadata> {
  const { slug, t } = await params;
  const { x, locale } = await load(slug, t);
  return { title: tName(x, locale), description: localise(x, locale).description.slice(0, 160) || undefined };
}

export default async function TournamentPage({ params, searchParams }: { params: Promise<{ slug: string; t: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { slug, t: tSlug } = await params;
  const { tab: raw } = await searchParams;
  const { project, t, locale, base, x } = await load(slug, tSlug);
  const lx = localise(x, locale);
  const phase = tournamentPhase(x);
  const g = playGame(x.game);
  const started = x.status === 'LIVE' || x.status === 'ENDED';
  const tabs: [string, string][] = [['overview', t.overview], ...(started ? [['bracket', x.format === 'ROUND_ROBIN' || x.format === 'SWISS' ? t.matches : t.bracket] as [string, string]] : []), ['participants', t.participants], ['rules', t.rules]];
  const tab = tabs.some(([k]) => k === raw) ? raw! : 'overview';
  const here = `${base}/t/${x.slug}`;
  const [entries, player, banner] = await Promise.all([
    prisma.entry.findMany({ where: { tournamentId: x.id, status: { in: [...ACTIVE_ENTRY] } }, orderBy: [{ place: { sort: 'asc', nulls: 'last' } }, { seed: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }], include: { members: { include: { player: { select: { id: true, country: true, gamerTag: true } } } } } }),
    currentPlayer(project.id),
    x.bannerAssetId ? prisma.asset.findUnique({ where: { id: x.bannerAssetId } }) : null,
  ]);
  // Places held for payment count as taken.
  const count = entries.length;
  const left = x.capacity - count;
  const tz = x.timezone;
  const when = (d: Date) => `${formatDate(d, tz, locale)}, ${formatTime(d, tz, locale)}`;
  const prizes = prizeList(x.prizes);
  const price = entryPrice(x);
  const team = x.teamSize > 1;
  const mine = player ? entries.find((e) => e.members.some((m) => m.playerId === player.id)) : undefined;

  let body: React.ReactNode = null;
  if (tab === 'overview') {
    body = (
      <div className="prose">
        {lx.description && <p style={{ whiteSpace: 'pre-line' }}>{lx.description}</p>}
        <h2>{t.schedule}</h2>
        <div className="panel" style={{ padding: '4px 18px' }}>
          {([[t.regOpens, when(x.regOpensAt)], [t.regCloses, when(x.regClosesAt)], ...(x.checkIn ? [[t.checkIn, when(new Date(x.startsAt.getTime() - CHECK_IN_MINUTES * 60_000))]] : []), [t.tStarts, when(x.startsAt)], [t.tEnds, when(x.endsAt)]] as [string, string][]).map(([a, b]) => <div key={a} className="kv"><span>{a}</span><b>{b}</b></div>)}
        </div>
        {prizes.length > 0 && (
          <>
            <h2>{t.prizes}</h2>
            <div className="panel" style={{ padding: '4px 18px' }}>{prizes.map((p) => <div key={p.place} className="kv"><span>{t.place(p.place)}</span><b>{[p.amountMinor ? formatMoney(p.amountMinor, x.currency) : '', p.label].filter(Boolean).join(' + ')}</b></div>)}</div>
          </>
        )}
      </div>
    );
  } else if (tab === 'bracket') {
    const matches = await prisma.match.findMany({ where: { tournamentId: x.id }, orderBy: [{ round: 'asc' }, { position: 'asc' }] });
    const names = new Map((await prisma.entry.findMany({ where: { tournamentId: x.id }, select: { id: true, name: true } })).map((e) => [e.id, e.name]));
    body = matches.length ? <PublicBracket t={t} tour={x} matches={matches} names={names} locale={locale} /> : <p>{t.notStarted}</p>;
  } else if (tab === 'participants') {
    body = entries.length ? (
      <div className="tw">
        <table className="st">
          <thead><tr><th>#</th><th>{team ? t.team : t.player}</th>{team && <th>{t.participants}</th>}<th>{t.country}</th></tr></thead>
          <tbody>
            {entries.filter((e) => e.status !== 'PENDING_PAYMENT').map((e, i) => {
              const cap = e.members.find((m) => m.playerId === e.captainId)?.player;
              const c = cap?.country ? playCountry(cap.country) : null;
              return <tr key={e.id}><td>{x.status === 'ENDED' && e.place ? t.place(e.place) : i + 1}</td><td><b>{e.name}</b></td>{team && <td style={{ fontSize: 13 }}>{e.members.map((m) => m.player.gamerTag).join(', ')}</td>}<td>{c ? `${c.flag} ${locale === 'ar' ? c.ar : c.name}` : ''}</td></tr>;
            })}
          </tbody>
        </table>
      </div>
    ) : <p>{t.nobody}</p>;
  } else {
    body = <div className="prose" dangerouslySetInnerHTML={{ __html: sanitizeRichText(project.rulesHtml) }} />;
  }

  // What the side panel offers, by state and by who's looking.
  let action: React.ReactNode;
  if (phase === 'reg') {
    const block = player && !mine ? await entryBlock(x, player, locale) : null;
    action = (
      <>
        <h3>{t.reg}</h3>
        <p style={{ margin: '0 0 14px', color: 'var(--muted)', fontSize: 14 }}>{left > 0 ? t.placesLeft(left) : t.full} · {t.regCloses} {when(x.regClosesAt)}</p>
        <div className="bar" style={{ marginBottom: 16 }}><i style={{ width: `${Math.min(100, (count / x.capacity) * 100)}%` }} /></div>
        {price.amountMinor > 0 && <p style={{ margin: '0 0 14px', fontSize: 13.5 }}>{t.feeLine(formatMoney(price.amountMinor, x.currency), formatMoney(price.feeMinor, x.currency))}</p>}
        {mine ? (
          mine.status === 'PENDING_PAYMENT'
            ? <form action={payAgain.bind(null, slug, x.slug)}><p style={{ margin: '0 0 12px', fontSize: 13.5 }}>{t.pendingPay}</p><button className="btn primary" style={{ width: '100%' }}>{t.payRetry}</button></form>
            : <><p style={{ margin: '0 0 12px', fontWeight: 600, color: 'var(--ok)' }}><Ic n="check" /> {t.youreIn}</p><Link className="btn primary" style={{ width: '100%' }} href={`${base}/me`}>{t.myMatches}</Link></>
        ) : !player ? (
          <Link className="btn primary" style={{ width: '100%' }} href={`${base}/signin?next=${encodeURIComponent(`${here}#register`)}`}>{t.signinToRegister}</Link>
        ) : block ? (
          <div className="notice warn" style={{ margin: 0 }}>{block}</div>
        ) : left <= 0 ? (
          <p style={{ margin: 0, fontWeight: 600 }}>{t.full}</p>
        ) : (
          <>
            <SiteForm action={registerAction.bind(null, slug, x.slug)} submit={price.totalMinor ? t.payNow(formatMoney(price.totalMinor, x.currency)) : t.register} pendingLabel="…">
              {team && <div className="fld"><label htmlFor="tn">{t.teamName}</label><input id="tn" name="teamName" className="inp" required maxLength={32} dir="auto" /><span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{t.teamNameHint}</span></div>}
            </SiteForm>
            {team && (
              <>
                <div className="or">{t.or}</div>
                <SiteForm action={joinTeamAction.bind(null, slug, x.slug)} submit={t.joinBtn} pendingLabel="…">
                  <div className="fld"><label htmlFor="jc">{t.teamCode}</label><input id="jc" name="code" className="inp" dir="ltr" required maxLength={12} style={{ textTransform: 'uppercase' }} /></div>
                </SiteForm>
              </>
            )}
          </>
        )}
      </>
    );
  } else if (phase === 'live') {
    action = <><h3>{locale === 'ar' ? `الجولة ${x.currentRound}` : `Round ${x.currentRound}`}</h3><p style={{ margin: '0 0 14px', color: 'var(--muted)', fontSize: 14 }}>{locale === 'ar' ? 'هل أنت مشارك؟ أرسل نتيجة مباراتك من صفحة مبارياتي.' : 'Playing in this tournament? Report your result from My matches.'}</p><Link className="btn primary" style={{ width: '100%' }} href={player ? `${base}/me` : `${base}/signin?next=${encodeURIComponent(`${base}/me`)}`}>{t.myMatches}</Link></>;
  } else if (phase === 'ended') {
    const top = entries.filter((e) => e.place && e.place <= 3).sort((a, b) => a.place! - b.place!);
    action = <><h3>{t.ended}</h3>{top.length ? top.map((e) => <div key={e.id} className="kv"><span>{t.place(e.place!)}</span><b>{e.name}</b></div>) : null}</>;
  } else {
    action = <><h3>{phaseText(phase, t)}</h3><p style={{ margin: 0, color: 'var(--muted)', fontSize: 14 }}>{phase === 'soon' ? t.regNotOpen(when(x.regOpensAt)) : phase === 'closed' ? `${t.regClosed} ${t.tStarts}: ${when(x.startsAt)}` : ''}</p>{mine && <p style={{ margin: '12px 0 0', fontWeight: 600, color: 'var(--ok)' }}><Ic n="check" /> {t.youreIn}</p>}</>;
  }

  return (
    <>
      <div className="dhero" style={{ background: `linear-gradient(135deg,${g.c1},${g.c2})` }}>
        {banner && <img src={fileUrl(banner.key)} alt="" className="banner-img" />}
        <div className="wrap">
          <div className="crumb"><Link href={`${base}/tournaments`}>{t.nav.tournaments}</Link> / {g.name}</div>
          <span className={`pill ${PILL[phase]}`} style={{ background: 'rgba(255,255,255,.92)' }}>{phaseText(phase, t)}</span>
          <h1>{lx.name}</h1>
          <div className="facts">
            <span><Ic n="cal" s={17} /> {t.startsOn} {formatDate(x.startsAt, tz, locale)}</span>
            <span><Ic n="trophy" s={17} /> {prizeLine(x, locale)}</span>
            <span><Ic n="users" s={17} /> {count}/{x.capacity}</span>
            <span><Ic n="gamepad" s={17} /> {x.platform || g.platform}</span>
          </div>
        </div>
      </div>
      <section style={{ paddingTop: 32 }}>
        <div className="wrap dlayout">
          <div>
            <nav className="tabs" aria-label={lx.name}>{tabs.map(([k, l]) => <Link key={k} href={k === 'overview' ? here : `${here}?tab=${k}`} aria-current={tab === k ? 'page' : undefined}>{l}</Link>)}</nav>
            {body}
          </div>
          <aside className="side">
            <div className="panel" id="register">{action}</div>
            <div className="panel" style={{ padding: '6px 20px' }}>
              {([[t.format, FORMAT_LABEL[x.format][locale]], [team ? t.team : t.player, t.teamSize(x.teamSize)], [t.matches, t.bestOf(x.bestOf)], [t.platform, x.platform || g.platform], [t.entryFee, price.amountMinor ? formatMoney(price.amountMinor, x.currency) : t.free], [t.countries, x.countries.length ? x.countries.map((c) => playCountry(c)?.flag ?? c).join(' ') : t.anywhere], ...(x.verifiedOnly ? [[t.participants, t.verifiedOnly]] : [])] as [string, string][]).map(([a, b]) => <div key={a + b} className="kv"><span>{a}</span><b>{b}</b></div>)}
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
