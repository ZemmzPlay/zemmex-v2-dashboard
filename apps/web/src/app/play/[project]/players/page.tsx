import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma, type Prisma } from '@zemmz/db';
import { formatDate, PLAY_COUNTRIES, playCountry } from '@zemmz/shared';
import { playCan, requireProject } from '@/lib/play/core';
import { fmt, plural } from '@/lib/format';
import { Icon } from '@/components/icon';
import { Avatar } from '@/components/avatar';
import { SearchBox } from '@/components/search-box';
import { UrlSelect } from '@/components/url-select';
import { ConfirmButton, SubmitButton } from '@/components/confirm-button';
import { FormDialog } from '@/components/form-dialog';
import { addPlayer, savePlayer, setBlacklisted, setVerification } from './actions';
import { PlayerFields } from './player-fields';

export const metadata: Metadata = { title: 'Players' };

const PER = 50;
const VAL: Record<string, [string, string]> = { VERIFIED: ['Verified', 'b-ok'], PENDING: ['Awaiting review', 'b-warn'], REJECTED: ['Not verified', 'b-neutral'] };

export default async function Players({ params, searchParams }: { params: Promise<{ project: string }>; searchParams: Promise<{ tab?: string; q?: string; verification?: string; country?: string; t?: string; page?: string }> }) {
  const { project: slug } = await params;
  const sp = await searchParams;
  const { user, project } = await requireProject(slug);
  const tab = sp.tab === 'blacklist' ? 'blacklist' : 'all';
  const where: Prisma.PlayPlayerWhereInput = { projectId: project.id, blacklisted: tab === 'blacklist' };
  if (sp.q) {
    const q = sp.q.trim();
    where.OR = [{ gamerTag: { contains: q, mode: 'insensitive' } }, { firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { phone: { contains: q.replace(/[^\d+]/g, '') || q } }];
  }
  if (sp.verification && VAL[sp.verification]) where.verification = sp.verification as keyof typeof VAL as never;
  if (sp.country) where.country = sp.country;
  if (sp.t) where.memberships = { some: { entry: { tournamentId: sp.t } } };
  const page = Math.max(1, Number(sp.page) || 1);
  const [rows, total, counts, tournaments] = await Promise.all([
    prisma.playPlayer.findMany({ where, orderBy: [{ createdAt: 'desc' }], skip: (page - 1) * PER, take: PER, include: { memberships: { include: { entry: { select: { tournament: { select: { name: true } } } } }, take: 3, orderBy: { id: 'desc' } } } }),
    prisma.playPlayer.count({ where }),
    Promise.all([prisma.playPlayer.count({ where: { projectId: project.id, blacklisted: false } }), prisma.playPlayer.count({ where: { projectId: project.id, blacklisted: true } })]),
    prisma.tournament.findMany({ where: { projectId: project.id }, select: { id: true, name: true }, orderBy: { startsAt: 'desc' }, take: 50 }),
  ]);
  const run = playCan.runTournaments(user.role);
  const base = `/play/${slug}/players`;
  const q = (extra: Record<string, string>) => `${base}?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v) as [string, string][]), ...extra })}`;
  const filtered = !!(sp.q || sp.verification || sp.country || sp.t);

  return (
    <>
      <div className="ph">
        <div><h1>Players</h1><p>Everyone with an account on {project.name}. Players sign up on the website with a code sent to their email or phone.</p></div>
        <div className="actions">
          <a href={`/play/${slug}/export/players`} className="btn secondary"><Icon name="download" size={16} /> Export</a>
          {run && <FormDialog action={addPlayer.bind(null, slug)} className="btn primary" label={<><Icon name="plus" size={16} /> Add player</>} title="Add a player" submitLabel="Add player"><PlayerFields id="new" /><label className="switch mt-4"><input type="checkbox" name="verified" defaultChecked /> <span>Mark as verified</span></label></FormDialog>}
        </div>
      </div>
      <nav className="tabs" aria-label="Players">
        <Link href={base} aria-current={tab === 'all' ? 'page' : undefined}>All players <span className="n">{fmt(counts[0])}</span></Link>
        <Link href={`${base}?tab=blacklist`} aria-current={tab === 'blacklist' ? 'page' : undefined}>Blacklist <span className="n">{fmt(counts[1])}</span></Link>
      </nav>
      <div className="toolbar">
        <SearchBox placeholder="Gamer tag, name, email or phone" label="Search players" />
        {tab === 'all' && <UrlSelect param="verification" label="Verification" value={sp.verification ?? ''} options={[['', 'Any verification'], ['PENDING', 'Awaiting review'], ['VERIFIED', 'Verified'], ['REJECTED', 'Not verified']]} />}
        <UrlSelect param="country" label="Country" value={sp.country ?? ''} options={[['', 'All countries'], ...PLAY_COUNTRIES.map((c) => [c.code, `${c.flag} ${c.name}`] as [string, string])]} />
        {tournaments.length > 0 && <UrlSelect param="t" label="Tournament" value={sp.t ?? ''} options={[['', 'All tournaments'], ...tournaments.map((t) => [t.id, t.name] as [string, string])]} />}
        {filtered && <Link href={tab === 'blacklist' ? `${base}?tab=blacklist` : base} className="btn ghost sm">Clear filters</Link>}
      </div>
      <div className="tbl-wrap">
        {rows.length ? (
          <table className="tbl">
            <thead><tr><th>Player</th><th>Contact</th><th>Country</th><th>Verification</th><th>Tournaments</th><th>Joined</th><th className="act"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td><div className="flex items-center gap-2.5"><Avatar name={`${p.firstName} ${p.lastName}`} size={32} /><div className="whitespace-nowrap"><b>{p.gamerTag}</b><div className="muted text-[12.5px]">{p.firstName} {p.lastName}</div></div></div></td>
                  <td className="text-[13px]">{p.email}{p.phone && <div className="muted tabular-nums">{p.phone}</div>}</td>
                  <td className="whitespace-nowrap">{p.country ? `${playCountry(p.country)?.flag ?? ''} ${playCountry(p.country)?.name ?? p.country}` : <span className="muted">—</span>}</td>
                  <td>{p.blacklisted ? <span className="badge b-danger">Blacklisted</span> : <span className={`badge ${VAL[p.verification][1]}`}>{VAL[p.verification][0]}</span>}</td>
                  <td className="text-[13px]">{p.memberships.length ? p.memberships.map((m) => <span key={m.id} className="block">{m.entry.tournament.name}</span>) : <span className="muted">None yet</span>}</td>
                  <td className="muted whitespace-nowrap text-[13px]">{formatDate(p.createdAt, project.timezone)}</td>
                  <td className="act whitespace-nowrap">
                    {!p.blacklisted && p.verification !== 'VERIFIED' && <form action={setVerification.bind(null, slug, p.id, 'VERIFIED')} className="inline"><SubmitButton className="btn ghost sm" pendingLabel="…"><Icon name="check" size={14} /> Verify</SubmitButton></form>}
                    {!p.blacklisted && p.verification === 'PENDING' && <form action={setVerification.bind(null, slug, p.id, 'REJECTED')} className="inline"><SubmitButton className="btn ghost sm" pendingLabel="…">Reject</SubmitButton></form>}
                    <FormDialog action={savePlayer.bind(null, slug, p.id)} className="btn ghost sm" label="Details" title={p.gamerTag} submitLabel="Save changes">
                      <p className="m-0 mb-4 text-[13px] text-muted">Joined {formatDate(p.createdAt, project.timezone)}{p.lastSeenAt ? `, last signed in ${formatDate(p.lastSeenAt, project.timezone)}` : ''}. {plural(p.memberships.length, 'recent tournament')}.</p>
                      <PlayerFields p={p} id={p.id} />
                    </FormDialog>
                    {p.blacklisted
                      ? <form action={setBlacklisted.bind(null, slug, p.id, false)} className="inline"><SubmitButton className="btn ghost sm" pendingLabel="…">Remove from blacklist</SubmitButton></form>
                      : <ConfirmButton action={setBlacklisted.bind(null, slug, p.id, true)} className="btn ghost sm text-danger" label="Blacklist" title={`Blacklist ${p.gamerTag}?`} confirmLabel="Blacklist" body={<p className="m-0">{p.gamerTag} is signed out, can’t register for tournaments, and is withdrawn from any that haven’t started. Matches already being played aren’t changed. You can undo this from the Blacklist tab.</p>} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty"><div className="ic"><Icon name={tab === 'blacklist' ? 'shield' : 'users'} /></div>
            <h3>{filtered ? 'No players match' : tab === 'blacklist' ? 'Nobody is blacklisted' : 'No players yet'}</h3>
            <p>{filtered ? 'Try searching by email or phone, or clear the filters.' : tab === 'blacklist' ? 'Blacklisted players can’t register for tournaments. Blacklist someone from their row.' : 'Players appear here when they sign up on your website.'}</p>
          </div>
        )}
      </div>
      {total > PER && (
        <div className="mt-3 flex items-center justify-between text-[13px] text-muted">
          <span>{fmt((page - 1) * PER + 1)}–{fmt(Math.min(total, page * PER))} of {fmt(total)}</span>
          <span className="flex gap-2">{page > 1 && <Link href={q({ page: String(page - 1) })} className="btn secondary sm">Previous</Link>}{page * PER < total && <Link href={q({ page: String(page + 1) })} className="btn secondary sm">Next</Link>}</span>
        </div>
      )}
    </>
  );
}
