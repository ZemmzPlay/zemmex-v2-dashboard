import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@zemmz/db';
import { playCountry, standings, type BMatch } from '@zemmz/shared';
import { siteFor, tName } from '@/lib/play/site';
import { ACTIVE_ENTRY } from '@/lib/play/core';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return { title: (await siteFor((await params).slug)).t.nav.standings };
}

export default async function Standings({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { project, t, locale, base } = await siteFor(slug);
  const list = await prisma.tournament.findMany({ where: { projectId: project.id, status: { in: ['LIVE', 'ENDED'] } }, orderBy: [{ status: 'asc' }, { startsAt: 'desc' }], take: 12 });
  const blocks = await Promise.all(list.map(async (x) => {
    const entries = await prisma.entry.findMany({ where: { tournamentId: x.id, status: { in: [...ACTIVE_ENTRY] } }, include: { members: { include: { player: { select: { country: true, id: true } } } } } });
    const name = new Map(entries.map((e) => [e.id, e]));
    const country = (id: string) => { const e = name.get(id); const c = e?.members.find((m) => m.player.id === e.captainId)?.player.country; return c ? `${playCountry(c)?.flag ?? ''} ${locale === 'ar' ? playCountry(c)?.ar : playCountry(c)?.name}` : ''; };
    if (x.format === 'ROUND_ROBIN' || x.format === 'SWISS') {
      const matches = await prisma.match.findMany({ where: { tournamentId: x.id } });
      const rows = standings(entries.map((e) => e.id), matches.map((m) => ({ id: m.id, bracket: m.bracket, round: m.round, position: m.position, a: m.entryAId, b: m.entryBId, aBye: m.aBye, bBye: m.bBye, scoreA: m.scoreA, scoreB: m.scoreB, winner: m.winnerId, status: m.status === 'CONFIRMED' ? 'CONFIRMED' : 'READY', next: null, loser: null }) as BMatch), x.format === 'SWISS' ? 1 : 3);
      return { x, table: rows.map((r) => ({ name: name.get(r.entry)?.name ?? '—', country: country(r.entry), p: r.played + r.byes, w: r.won, l: r.lost, diff: r.diff, pts: r.points })) };
    }
    if (x.status !== 'ENDED') return { x, table: null };
    const placed = entries.filter((e) => e.place).sort((a, b) => a.place! - b.place!);
    return { x, places: placed.map((e) => ({ place: e.place!, name: e.name, country: country(e.id) })) };
  }));
  const team = (teamSize: number) => (teamSize > 1 ? t.team : t.player);
  return (
    <section>
      <div className="wrap">
        <div className="sec-h"><div><h2>{t.standT}</h2><p>{t.standP}</p></div></div>
        {blocks.length === 0 ? <div className="panel" style={{ textAlign: 'center', padding: 48 }}>{t.noStandings}</div> : (
          <div className="tgrid">
            {blocks.map((b) => (
              <div key={b.x.id} className="panel">
                <h3><Link href={`${base}/t/${b.x.slug}`} style={{ color: 'inherit' }}>{tName(b.x, locale)}</Link></h3>
                {'table' in b && b.table ? (
                  <div className="tw"><table className="st"><thead><tr><th>#</th><th>{team(b.x.teamSize)}</th><th className="num">{t.p}</th><th className="num">{t.w}</th><th className="num">{t.l}</th><th className="num">{t.pts}</th></tr></thead>
                    <tbody>{b.table.map((r, i) => <tr key={r.name} className={i < 2 ? 'q' : ''}><td>{i + 1}</td><td><b>{r.name}</b></td><td className="num">{r.p}</td><td className="num">{r.w}</td><td className="num">{r.l}</td><td className="num"><b>{r.pts}</b></td></tr>)}</tbody></table></div>
                ) : 'places' in b && b.places?.length ? (
                  <div className="tw"><table className="st"><thead><tr><th>#</th><th>{team(b.x.teamSize)}</th><th>{t.country}</th></tr></thead><tbody>{b.places.map((r) => <tr key={r.name} className={r.place === 1 ? 'q' : ''}><td>{t.place(r.place)}</td><td><b>{r.name}</b></td><td>{r.country}</td></tr>)}</tbody></table></div>
                ) : <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14 }}>{t.live}. <Link href={`${base}/t/${b.x.slug}?tab=bracket`}>{t.bracket}</Link></p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
