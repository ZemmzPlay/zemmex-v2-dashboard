import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma, type Tournament } from '@zemmz/db';
import { FORMAT_LABEL, formatDate, formatDateRange, formatMoney, formatTime, playCountry, playGame, standings, type BMatch } from '@zemmz/shared';
import { ACTIVE_ENTRY, matchLabeller, PHASE_LABEL, playCan, requireProject, tournamentPhase } from '@/lib/play/core';
import { bracketView, prizeList } from '@/lib/play/bracket';
import { CHECK_IN_MINUTES, entryPrice } from '@/lib/play/entries';
import { fileUrl } from '@/lib/storage';
import { fmt, pct } from '@/lib/format';
import { Icon } from '@/components/icon';
import { ConfirmButton, SubmitButton } from '@/components/confirm-button';
import { ConfirmAction } from '@/components/confirm-action';
import { FormDialog } from '@/components/form-dialog';
import { SimpleForm } from '@/components/simple-form';
import { Uploader } from '@/components/uploader';
import { endAction, markPrizePaid, refundEntryAction, reopenMatch, saveSeeds, setEntryStatus, setPublished, startAction, confirmMatch } from '../actions';
import { ReportsPanel, type ReportFilter } from '../reports';
import { ResultForm } from '../result-form';

export async function generateMetadata({ params }: { params: Promise<{ project: string; t: string }> }): Promise<Metadata> {
  const { project: slug, t } = await params;
  const row = await prisma.tournament.findFirst({ where: { slug: t, project: { slug } }, select: { name: true } });
  return { title: row?.name ?? 'Tournament' };
}

type Tab = 'overview' | 'participants' | 'bracket' | 'reports' | 'prizes';

export default async function TournamentPage({ params, searchParams }: { params: Promise<{ project: string; t: string }>; searchParams: Promise<{ tab?: string; m?: string; f?: string; created?: string }> }) {
  const { project: slug, t: tSlug } = await params;
  const sp = await searchParams;
  const { user, project } = await requireProject(slug);
  const t = await prisma.tournament.findUnique({ where: { projectId_slug: { projectId: project.id, slug: tSlug } } });
  if (!t) notFound();
  const run = playCan.runTournaments(user.role);
  const tabs: [Tab, string, number | null][] = [];
  const [entrants, openReports] = await Promise.all([
    prisma.entry.count({ where: { tournamentId: t.id, status: { in: [...ACTIVE_ENTRY] } } }),
    prisma.match.count({ where: { tournamentId: t.id, status: { in: ['REVIEW', 'CONFLICT', 'PROOF'] } } }),
  ]);
  tabs.push(['overview', 'Overview', null], ['participants', t.teamSize > 1 ? 'Teams' : 'Players', entrants]);
  const started = t.status === 'LIVE' || t.status === 'ENDED';
  if (started) tabs.push(['bracket', t.format === 'ROUND_ROBIN' || t.format === 'SWISS' ? 'Matches and standings' : 'Bracket', null], ['reports', 'Score reports', openReports]);
  if (prizeList(t.prizes).length) tabs.push(['prizes', 'Prizes', null]);
  const tab = (tabs.find(([k]) => k === sp.tab)?.[0] ?? 'overview') as Tab;
  const base = `/play/${slug}/tournaments/${t.slug}`;
  const phase = tournamentPhase(t);
  const g = playGame(t.game);

  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb"><Link href={`/play/${slug}/tournaments`}>Tournaments</Link><Icon name="chevr" size={14} /><span>{t.name}</span></nav>
      <div className="ph">
        <div className="flex items-center gap-3.5">
          <span className="game-art !h-12 !w-12" style={{ background: `linear-gradient(135deg,${g.c1},${g.c2})` }} aria-hidden />
          <div>
            <h1 className="flex flex-wrap items-center gap-2.5">{t.name} <span className={`badge ${PHASE_LABEL[phase].badge}`}>{PHASE_LABEL[phase].en}</span></h1>
            <p>{g.name} · {FORMAT_LABEL[t.format].en}{t.teamSize > 1 ? ` · teams of ${t.teamSize}` : ''} · {formatDateRange(t.startsAt, t.endsAt, t.timezone)}</p>
          </div>
        </div>
        <div className="actions">
          {t.status !== 'DRAFT' && <a href={`/p/${slug}/t/${t.slug}`} target="_blank" rel="noopener" className="btn secondary"><Icon name="ext" size={16} /> View on website</a>}
          {run && t.status !== 'CANCELLED' && t.status !== 'ENDED' && <Link href={`${base}/edit`} className="btn secondary">Edit</Link>}
          {run && <PrimaryAction slug={slug} t={t} entrants={entrants} />}
        </div>
      </div>
      {sp.created && <div className="notice ok mb-4" role="status">{t.status === 'DRAFT' ? 'Saved as a draft. Publish it when you’re ready and it appears on your website.' : 'Published. Registration opens on the website on its dates.'}</div>}
      <nav className="tabs" aria-label="Tournament">
        {tabs.map(([k, l, n]) => <Link key={k} href={k === 'overview' ? base : `${base}?tab=${k}`} aria-current={tab === k ? 'page' : undefined}>{l}{n != null && <span className="n">{n}</span>}</Link>)}
      </nav>
      {tab === 'overview' && <Overview slug={slug} t={t} entrants={entrants} openReports={openReports} run={run} />}
      {tab === 'participants' && <Participants slug={slug} t={t} run={run} manage={playCan.manageProject(user.role)} />}
      {tab === 'bracket' && <Bracket slug={slug} t={t} selected={sp.m} run={run} />}
      {tab === 'reports' && (
        <ReportsPanel projectId={project.id} slug={slug} tz={t.timezone} tournamentId={t.id} filter={(['open', 'conflict', 'done'].includes(sp.f ?? '') ? sp.f : 'open') as ReportFilter}
          selected={sp.m} href={(q) => `${base}?${new URLSearchParams({ tab: 'reports', ...q })}`} canReopen={run} />
      )}
      {tab === 'prizes' && <Prizes slug={slug} t={t} manage={playCan.manageProject(user.role)} />}
    </>
  );
}

/** The one thing to do next, by state: publish, start, or end. */
function PrimaryAction({ slug, t, entrants }: { slug: string; t: Tournament; entrants: number }) {
  if (t.status === 'DRAFT') {
    return <form action={setPublished.bind(null, slug, t.id, true)}><SubmitButton pendingLabel="Publishing…">Publish</SubmitButton></form>;
  }
  if (t.status === 'PUBLISHED') {
    const early = new Date() < t.regClosesAt;
    return (
      <ConfirmAction action={startAction.bind(null, slug, t.id)} danger={false} className="btn primary" label={<><Icon name="bracket" size={16} /> Start tournament</>} title={`Start ${t.name}?`} confirmLabel="Start and build the bracket"
        body={<>
          <p className="m-0 mb-2">Registration closes and the bracket is built from {fmt(entrants)} {t.teamSize > 1 ? 'teams' : 'players'}, by seed and then by who registered first. The first matches open straight away.</p>
          {t.checkIn && <p className="m-0 mb-2">Only those who checked in play; everyone else is withdrawn.</p>}
          {t.teamSize > 1 && <p className="m-0 mb-2">Teams without {t.teamSize} players are withdrawn.</p>}
          {early && <p className="m-0 text-warn">Registration was meant to stay open until {formatDate(t.regClosesAt, t.timezone)}, {formatTime(t.regClosesAt, t.timezone)}.</p>}
        </>} />
    );
  }
  if (t.status === 'LIVE') {
    return <ConfirmButton action={endAction.bind(null, slug, t.id)} className="btn danger-ghost" label="End tournament" title={`End ${t.name}?`} confirmLabel="End tournament" body={<p className="m-0">Matches still to play stop and players can’t report scores. If the bracket isn’t finished, no places or prizes are set. This can’t be undone.</p>} />;
  }
  return null;
}

async function Overview({ slug, t, entrants, openReports, run }: { slug: string; t: Tournament; entrants: number; openReports: number; run: boolean }) {
  const tz = t.timezone;
  const when = (d: Date) => `${formatDate(d, tz)}, ${formatTime(d, tz)}`;
  const banner = t.bannerAssetId ? await prisma.asset.findUnique({ where: { id: t.bannerAssetId } }) : null;
  const price = entryPrice(t);
  const [paid, matches] = await Promise.all([
    prisma.entryOrder.aggregate({ where: { tournamentId: t.id, status: 'PAID' }, _sum: { amountMinor: true }, _count: true }),
    prisma.match.groupBy({ by: ['status'], where: { tournamentId: t.id }, _count: true }),
  ]);
  const count = (s: string) => matches.find((m) => m.status === s)?._count ?? 0;
  const played = count('CONFIRMED'), totalMatches = matches.reduce((n, m) => n + m._count, 0);
  const prizes = prizeList(t.prizes);
  const facts: [string, React.ReactNode][] = [
    ['Registration', `${when(t.regOpensAt)} to ${when(t.regClosesAt)}`],
    ['Tournament', `${when(t.startsAt)} to ${when(t.endsAt)}`],
    ['Timezone', tz.replace('_', ' ')],
    ['Matches', `Best of ${t.bestOf}`],
    ['Results', t.playersReport ? 'Players upload a screenshot; an admin confirms' : 'Admins enter every result'],
    ['Who can enter', `${t.verifiedOnly ? 'Verified players' : 'Anyone with an account'}${t.countries.length ? ` in ${t.countries.map((c) => playCountry(c)?.name ?? c).join(', ')}` : ', from any country'}`],
    ['Check-in', t.checkIn ? `Opens ${CHECK_IN_MINUTES} minutes before the start` : 'Not needed'],
    ['Entry fee', price.amountMinor ? `${formatMoney(price.amountMinor, t.currency)} per ${t.teamSize > 1 ? 'team' : 'player'}, plus a ${formatMoney(price.feeMinor, t.currency)} booking fee` : 'Free'],
    ['Platform', t.platform || '—'],
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="card kpi"><div className="l">{t.teamSize > 1 ? 'Teams' : 'Players'}</div><div className="v">{fmt(entrants)}</div><div className="d">of {fmt(t.capacity)} places</div><span className="prog mt-2 block"><i style={{ width: `${pct(entrants, t.capacity)}%` }} /></span></div>
          <div className="card kpi"><div className="l">Matches played</div><div className="v">{fmt(played)}</div><div className="d">{totalMatches ? `of ${fmt(totalMatches)} so far` : 'Once the bracket is built'}</div></div>
          <div className="card kpi"><div className="l">{price.amountMinor ? 'Entry fees' : 'Results to confirm'}</div><div className="v">{price.amountMinor ? formatMoney(paid._sum.amountMinor ?? 0, t.currency) : fmt(openReports)}</div><div className="d">{price.amountMinor ? `${fmt(paid._count)} paid` : openReports ? <Link href={`?tab=reports`}>Review them</Link> : 'Nothing waiting'}</div></div>
        </div>
        <section className="card">
          <div className="card-h"><h2>Details</h2></div>
          <div className="card-b !pt-1">
            <table className="tbl !min-w-0"><tbody>{facts.map(([k, v]) => <tr key={k}><td className="w-[160px] text-muted">{k}</td><td>{v}</td></tr>)}</tbody></table>
            {t.description && <p className="mt-4 mb-0 whitespace-pre-line text-[14px]">{t.description}</p>}
          </div>
        </section>
      </div>
      <div className="flex flex-col gap-4">
        <section className="card">
          <div className="card-h"><h2>Banner</h2></div>
          <div className="card-b">
            {banner ? <img src={fileUrl(banner.key)} alt="" className="mb-3 aspect-[16/7] w-full rounded-lg object-cover" /> : <div className="game-art mb-3 !aspect-[16/7] !h-auto !w-full" style={{ background: `linear-gradient(135deg,${playGame(t.game).c1},${playGame(t.game).c2})` }} />}
            {run && <Uploader slug={slug} endpoint={`/play/${slug}/files`} kind="TOURNAMENT_BANNER" target={t.id} label={banner ? 'Replace banner' : 'Upload a banner'} accept="image/png,image/jpeg,image/webp" hint="Wide images work best, about 1600 × 700. Without one, the game’s colours are used." />}
          </div>
        </section>
        {prizes.length > 0 && (
          <section className="card">
            <div className="card-h"><h2>Prizes</h2></div>
            <div className="card-b !pt-1"><ul className="m-0 list-none p-0 text-[14px]">{prizes.map((p) => <li key={p.place} className="flex justify-between border-b border-line py-2 last:border-0"><span>{ordinal(p.place)} place</span><b>{[p.amountMinor ? formatMoney(p.amountMinor, t.currency) : '', p.label].filter(Boolean).join(' + ')}</b></li>)}</ul></div>
          </section>
        )}
        {run && (t.status === 'PUBLISHED' || t.status === 'DRAFT') && (
          <section className="card">
            <div className="card-h"><h2>Stop this tournament</h2></div>
            <div className="card-b flex flex-wrap gap-2">
              {t.status === 'PUBLISHED' && <form action={setPublished.bind(null, slug, t.id, false)}><SubmitButton className="btn secondary" pendingLabel="Working…">Unpublish</SubmitButton></form>}
              <ConfirmButton action={endAction.bind(null, slug, t.id)} label="Cancel tournament" title={`Cancel ${t.name}?`} confirmLabel="Cancel tournament"
                body={<p className="m-0">It’s taken off the website and nobody can register. {entryPrice(t).amountMinor ? 'Everyone who paid gets their entry fee back (the booking fee isn’t refunded). ' : ''}This can’t be undone.</p>} />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
const ENTRY_BADGE: Record<string, [string, string]> = {
  PENDING_PAYMENT: ['Payment pending', 'b-warn'], REGISTERED: ['Registered', 'b-info'], CHECKED_IN: ['Checked in', 'b-ok'], WITHDRAWN: ['Withdrawn', 'b-neutral'], DISQUALIFIED: ['Disqualified', 'b-danger'],
};

async function Participants({ slug, t, run, manage }: { slug: string; t: Tournament; run: boolean; manage: boolean }) {
  const entries = await prisma.entry.findMany({
    where: { tournamentId: t.id }, orderBy: [{ place: { sort: 'asc', nulls: 'last' } }, { seed: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    include: { members: { include: { player: true }, orderBy: { id: 'asc' } } },
  });
  const orders = await prisma.entryOrder.findMany({ where: { tournamentId: t.id, status: { in: ['PAID', 'REFUNDED'] } } });
  const seedable = run && (t.status === 'DRAFT' || t.status === 'PUBLISHED');
  const team = t.teamSize > 1;
  if (!entries.length) {
    return <div className="card empty"><div className="ic"><Icon name="users" /></div><h3>Nobody has registered yet</h3><p>{t.status === 'DRAFT' ? 'Publish the tournament and players can register on your website on its dates.' : `Registration ${new Date() < t.regOpensAt ? 'opens' : 'is open until'} ${formatDate(new Date() < t.regOpensAt ? t.regOpensAt : t.regClosesAt, t.timezone)}. Share the link with players.`}</p></div>;
  }
  const table = (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr>{seedable ? <th className="w-[84px]">Seed</th> : t.status === 'ENDED' ? <th className="w-[70px]">Place</th> : null}<th>{team ? 'Team' : 'Player'}</th>{team && <th>Players</th>}<th>Country</th><th>Status</th>{t.entryFeeMinor > 0 && <th>Entry fee</th>}<th className="act"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>
          {entries.map((e) => {
            const captain = e.members.find((m) => m.playerId === e.captainId)?.player ?? e.members[0]?.player;
            const order = orders.find((o) => o.entryId === e.id);
            const active = (ACTIVE_ENTRY as readonly string[]).includes(e.status);
            return (
              <tr key={e.id} className={active ? '' : 'opacity-60'}>
                {seedable ? <td><label className="sr-only" htmlFor={`seed_${e.id}`}>Seed for {e.name}</label><input id={`seed_${e.id}`} name={`seed_${e.id}`} form="seeds" className="inp !h-9 !w-[64px]" type="number" min={1} defaultValue={e.seed ?? ''} disabled={!active} /></td> : t.status === 'ENDED' ? <td className="font-semibold">{e.place ? ordinal(e.place) : '—'}</td> : null}
                <td><b>{e.name}</b>{!team && captain && <div className="muted text-[12.5px]">{captain.firstName} {captain.lastName}{captain.verification === 'VERIFIED' ? ' · verified' : ''}</div>}{team && e.joinCode && active && t.status === 'PUBLISHED' && <div className="muted text-[12.5px]">Team code {e.joinCode}</div>}</td>
                {team && <td className="text-[13px]">{e.members.map((m) => <span key={m.id} className="block">{m.player.gamerTag}{m.playerId === e.captainId ? <span className="muted"> (captain)</span> : ''}</span>)}<span className={e.members.length < t.teamSize ? 'text-warn text-[12px]' : 'muted text-[12px]'}>{e.members.length} of {t.teamSize}</span></td>}
                <td className="whitespace-nowrap">{captain?.country ? `${playCountry(captain.country)?.flag ?? ''} ${playCountry(captain.country)?.name ?? captain.country}` : '—'}</td>
                <td><span className={`badge ${ENTRY_BADGE[e.status][1]}`}>{ENTRY_BADGE[e.status][0]}</span></td>
                {t.entryFeeMinor > 0 && <td className="whitespace-nowrap text-[13px]">{order ? (order.status === 'REFUNDED' ? 'Refunded' : `Paid ${formatMoney(order.amountMinor, order.currency)}`) : '—'}</td>}
                <td className="act whitespace-nowrap">
                  {run && t.checkIn && t.status === 'PUBLISHED' && e.status === 'REGISTERED' && <form action={setEntryStatus.bind(null, slug, e.id, 'CHECKED_IN')} className="inline"><SubmitButton className="btn ghost sm" pendingLabel="…">Check in</SubmitButton></form>}
                  {run && active && t.status !== 'ENDED' && t.status !== 'CANCELLED' && (
                    <ConfirmButton action={setEntryStatus.bind(null, slug, e.id, 'DISQUALIFIED')} className="btn ghost sm text-danger" label="Disqualify" title={`Disqualify ${e.name}?`} confirmLabel="Disqualify"
                      body={<p className="m-0">{t.status === 'LIVE' ? `${e.name} can’t report scores any more. Enter their remaining matches as losses so their opponents go through.` : `${e.name} loses their place and won’t be in the bracket.`} You can reinstate them before the tournament starts.</p>} />
                  )}
                  {run && (e.status === 'DISQUALIFIED' || e.status === 'WITHDRAWN') && (t.status === 'PUBLISHED' || t.status === 'DRAFT') && <form action={setEntryStatus.bind(null, slug, e.id, 'REGISTERED')} className="inline"><SubmitButton className="btn ghost sm" pendingLabel="…">Reinstate</SubmitButton></form>}
                  {manage && order?.status === 'PAID' && (
                    <ConfirmAction action={refundEntryAction.bind(null, slug, e.id)} className="btn ghost sm" label="Refund" title={`Refund ${e.name}’s entry fee?`} confirmLabel={`Refund ${formatMoney(order.amountMinor, order.currency)}`}
                      body={<p className="m-0">{formatMoney(order.amountMinor, order.currency)} goes back to the card that paid. The booking fee isn’t refunded.{t.status === 'PUBLISHED' || t.status === 'DRAFT' ? ` ${e.name} is withdrawn.` : ''}</p>} />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
  return (
    <>
      <div className="toolbar"><span className="grow muted text-[13px]">{seedable ? 'Seed 1 is kept apart from seed 2 until the final. Leave seeds empty to use the order people registered.' : `${entries.length} ${team ? 'teams' : 'players'}, including any who withdrew.`}</span><a href={`/play/${slug}/export/entries?t=${t.id}`} className="btn secondary sm"><Icon name="download" size={15} /> Export</a></div>
      {table}
      {seedable && <div className="mt-4"><SimpleForm id="seeds" action={saveSeeds.bind(null, slug, t.id)} submitLabel="Save seeds" canEdit>{null}</SimpleForm></div>}
    </>
  );
}

async function Bracket({ slug, t, selected, run }: { slug: string; t: Tournament; selected?: string; run: boolean }) {
  const { matches, name, reopenable } = await bracketView(t.id);
  const label = matchLabeller(t, matches);
  const base = `/play/${slug}/tournaments/${t.slug}`;
  const pick = matches.find((m) => m.id === selected && m.status !== 'CONFIRMED' && m.status !== 'PENDING');
  const saved = matches.find((m) => m.id === selected && m.status === 'CONFIRMED');
  const table = t.format === 'ROUND_ROBIN' || t.format === 'SWISS';
  const box = (m: (typeof matches)[number]) => {
    const has = m.status === 'CONFIRMED';
    const row = (id: string | null, bye: boolean, score: number | null) => (
      <div className={`row ${has && m.winnerId === id && id ? 'win' : ''} ${!id ? 'tbd' : ''}`}><span>{id ? name(id) : bye ? 'Bye' : 'To be decided'}</span><span className="sc">{has && !m.aBye && !m.bBye ? score : ''}</span></div>
    );
    const playable = t.status === 'LIVE' && m.entryAId && m.entryBId && !has;
    return (
      <div key={m.id} className="bmatch" id={`m-${m.id}`}>
        {row(m.entryAId, m.aBye, m.scoreA)}
        {row(m.entryBId, m.bBye, m.scoreB)}
        {playable && m.reports.length > 0 && <Link className="act" href={`${base}?tab=reports&m=${m.id}`}><Icon name="image" size={13} /> Screenshot waiting: review</Link>}
        {playable && !m.reports.length && run && <Link className="act" href={`${base}?tab=bracket&m=${m.id}#result`}>Enter result</Link>}
        {has && run && t.status === 'LIVE' && reopenable.has(m.id) && !m.aBye && !m.bBye && (
          <ConfirmButton action={reopenMatch.bind(null, slug, m.id)} className="act !text-muted" label="Reopen" title="Reopen this result?" confirmLabel="Reopen result" body={<p className="m-0">The score of {name(m.entryAId)} vs {name(m.entryBId)} is cleared and the match waits for a result again.</p>} />
        )}
      </div>
    );
  };
  const groups = new Map<string, (typeof matches)[number][]>();
  for (const m of matches) {
    const k = table ? `R${m.round}` : `${m.bracket}${String(m.round).padStart(3, '0')}`;
    groups.set(k, [...(groups.get(k) ?? []), m]);
  }
  const order = ['W', 'L', 'F', 'RR', 'S'];
  const cols = [...groups.entries()].sort(([a], [b]) => (table ? Number(a.slice(1)) - Number(b.slice(1)) : order.indexOf(a.replace(/\d+/, '')) - order.indexOf(b.replace(/\d+/, '')) || a.localeCompare(b)));
  const brackets = table ? [['', cols]] as const : (['W', 'L', 'F'] as const).map((b) => [b, cols.filter(([k]) => k.startsWith(b))] as const).filter(([, c]) => c.length);
  const standingRows = table ? standings(
    (await prisma.entry.findMany({ where: { tournamentId: t.id, status: { in: [...ACTIVE_ENTRY] } }, select: { id: true } })).map((e) => e.id),
    matches.map((m) => ({ id: m.id, bracket: m.bracket, round: m.round, position: m.position, a: m.entryAId, b: m.entryBId, aBye: m.aBye, bBye: m.bBye, scoreA: m.scoreA, scoreB: m.scoreB, winner: m.winnerId, status: m.status === 'CONFIRMED' ? 'CONFIRMED' : 'READY', next: null, loser: null }) as BMatch),
    t.format === 'SWISS' ? 1 : 3,
  ) : [];

  return (
    <div className="flex flex-col gap-4">
      {saved && (
        <div className="notice ok" role="status">
          {name(saved.winnerId)} won {name(saved.entryAId)} {saved.scoreA}–{saved.scoreB} {name(saved.entryBId)}.{t.status === 'ENDED' ? ' That was the last match, so the tournament has ended and places are set.' : ' The bracket is updated.'}
        </div>
      )}
      {pick && (
        <section className="card" id="result">
          <div className="card-h"><h2>Enter result: {name(pick.entryAId)} vs {name(pick.entryBId)}</h2><div className="r"><Link href={`${base}?tab=bracket`} className="btn ghost sm">Close</Link></div></div>
          <div className="card-b">
            <p className="m-0 mb-3 text-[13px] text-muted">{label(pick)} · best of {t.bestOf}. Use this when a player can’t upload a screenshot. The result is logged against your name.</p>
            <ResultForm key={pick.id} action={confirmMatch.bind(null, slug, pick.id)} a={name(pick.entryAId)!} b={name(pick.entryBId)!} initial={[null, null]} knockout={t.format === 'SINGLE_ELIMINATION' || (t.format === 'DOUBLE_ELIMINATION' && pick.bracket !== 'W')} submitLabel="Save result" note />
          </div>
        </section>
      )}
      {table && (
        <section className="card">
          <div className="card-h"><h2>Standings</h2><span className="sub">{t.format === 'SWISS' ? `Round ${t.currentRound} of ${t.swissRounds} · 1 point a win` : '3 points a win'}; ties split by score difference</span></div>
          <div className="card-b !pt-1">
            <table className="tbl !min-w-0"><thead><tr><th className="w-[48px]">#</th><th>{t.teamSize > 1 ? 'Team' : 'Player'}</th><th>Played</th><th>Won</th><th>Lost</th><th>Difference</th><th>Points</th></tr></thead>
              <tbody>{standingRows.map((r, i) => <tr key={r.entry}><td>{i + 1}</td><td className="font-semibold">{name(r.entry)}</td><td>{r.played + r.byes}</td><td>{r.won}</td><td>{r.lost}</td><td>{r.diff > 0 ? `+${r.diff}` : r.diff}</td><td className="font-semibold">{r.points}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      )}
      {brackets.map(([b, list]) => (
        <section key={b} className="card">
          <div className="card-h"><h2>{table ? 'Matches' : b === 'W' ? (t.format === 'DOUBLE_ELIMINATION' ? 'Upper bracket' : 'Bracket') : b === 'L' ? 'Lower bracket' : 'Grand final'}</h2>{b === 'W' || table ? <span className="sub">Winners are set from confirmed results. Green rows show who went through.</span> : null}</div>
          <div className="card-b"><div className="bracket">{list.map(([k, ms]) => <div key={k} className="bcol"><h4>{label(ms[0])}</h4><div className="bcol-m">{ms.map(box)}</div></div>)}</div></div>
        </section>
      ))}
    </div>
  );
}

async function Prizes({ slug, t, manage }: { slug: string; t: Tournament; manage: boolean }) {
  const prizes = prizeList(t.prizes);
  const awards = await prisma.prizeAward.findMany({ where: { tournamentId: t.id }, orderBy: [{ place: 'asc' }] });
  const entries = await prisma.entry.findMany({ where: { id: { in: awards.map((a) => a.entryId) } }, include: { members: { include: { player: true } } } });
  if (!awards.length) {
    return (
      <section className="card">
        <div className="card-h"><h2>Prizes</h2><span className="sub">{t.status === 'ENDED' ? 'The bracket didn’t finish, so no places were set.' : 'Winners appear here when the last match is confirmed.'}</span></div>
        <div className="card-b !pt-1"><table className="tbl !min-w-0"><tbody>{prizes.map((p) => <tr key={p.place}><td className="w-[120px]">{ordinal(p.place)} place</td><td>{[p.amountMinor ? formatMoney(p.amountMinor, t.currency) : '', p.label].filter(Boolean).join(' + ')}</td></tr>)}</tbody></table></div>
      </section>
    );
  }
  const owed = awards.filter((a) => !a.paidAt && a.amountMinor > 0).reduce((n, a) => n + a.amountMinor, 0);
  return (
    <section className="card">
      <div className="card-h"><h2>Winners</h2><span className="sub">{owed ? `${formatMoney(owed, t.currency)} still to pay. Pay winners directly, then record the reference here.` : 'Every cash prize is marked as paid.'}</span></div>
      <div className="card-b !pt-1">
        <table className="tbl !min-w-0">
          <thead><tr><th className="w-[80px]">Place</th><th>Winner</th><th>Contact</th><th>Prize</th><th>Paid</th><th className="act"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {awards.map((a) => {
              const e = entries.find((x) => x.id === a.entryId);
              const cap = e?.members.find((m) => m.playerId === e.captainId)?.player;
              return (
                <tr key={a.id}>
                  <td className="font-semibold">{ordinal(a.place)}</td>
                  <td><b>{e?.name ?? '—'}</b>{cap && <div className="muted text-[12.5px]">{cap.firstName} {cap.lastName}</div>}</td>
                  <td className="text-[13px]">{cap ? <><a href={`mailto:${cap.email}`}>{cap.email}</a>{cap.phone && <div className="muted">{cap.phone}</div>}</> : '—'}</td>
                  <td>{[a.amountMinor ? formatMoney(a.amountMinor, t.currency) : '', a.label].filter(Boolean).join(' + ')}</td>
                  <td className="text-[13px]">{a.paidAt ? <><span className="badge b-ok">Paid</span><div className="muted mt-1">{formatDate(a.paidAt, t.timezone)} · {a.reference}</div></> : a.amountMinor ? <span className="badge b-warn">To pay</span> : '—'}</td>
                  <td className="act">
                    {manage && !a.paidAt && a.amountMinor > 0 && (
                      <FormDialog action={markPrizePaid.bind(null, slug, a.id)} className="btn secondary sm" label="Mark as paid" title={`${ordinal(a.place)} place: ${e?.name}`} submitLabel="Mark as paid">
                        <p className="m-0 mb-3 text-[13px] text-muted">Record the transfer you made for {formatMoney(a.amountMinor, t.currency)}, so there’s a trail if the winner asks.</p>
                        <div className="fld !mb-0"><label htmlFor={`ref-${a.id}`}>Payment reference</label><input id={`ref-${a.id}`} name="reference" className="inp" required maxLength={80} placeholder="For example, bank transfer FT2609…" /></div>
                      </FormDialog>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
