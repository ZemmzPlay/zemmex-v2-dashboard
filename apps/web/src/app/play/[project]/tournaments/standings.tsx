import { prisma, type StandingTable } from '@zemmz/db';
import { arabicOf, formatDate } from '@zemmz/shared';
import { Icon } from '@/components/icon';
import { FormDialog } from '@/components/form-dialog';
import { ConfirmButton } from '@/components/confirm-button';
import { deleteStandingTable, saveStandingTable } from './actions';

export interface StandingRow { name: string; played: number; won: number; lost: number; points: number }
export const standingRows = (raw: unknown): StandingRow[] => (Array.isArray(raw) ? (raw as StandingRow[]) : []);

/**
 * Standings the organisers write themselves (the prototype's "Add standings"):
 * groups played elsewhere, qualifiers, season tables. Round robin and Swiss
 * tables are computed from results and shown on the tournament pages.
 */
export async function StandingTables({ projectId, slug, tz, bilingual, canEdit }: { projectId: string; slug: string; tz: string; bilingual: boolean; canEdit: boolean }) {
  const [tables, tournaments] = await Promise.all([
    prisma.standingTable.findMany({ where: { projectId }, orderBy: { updatedAt: 'desc' } }),
    prisma.tournament.findMany({ where: { projectId }, select: { id: true, name: true }, orderBy: { startsAt: 'desc' } }),
  ]);
  const form = (s?: StandingTable) => {
    const ar = s ? arabicOf(s) : {};
    return (
      <>
        <div className="fld"><label htmlFor={`st-t-${s?.id ?? 'new'}`}>Title</label><input id={`st-t-${s?.id ?? 'new'}`} name="title" className="inp" required maxLength={80} defaultValue={s?.title} placeholder="For example, Group A" /></div>
        {bilingual && <div className="fld"><label htmlFor={`st-ta-${s?.id ?? 'new'}`}>Title in Arabic<span className="opt">optional</span></label><input id={`st-ta-${s?.id ?? 'new'}`} name="ar_title" dir="rtl" lang="ar" className="inp" maxLength={80} defaultValue={typeof ar.title === 'string' ? ar.title : ''} /></div>}
        <div className="fld"><label htmlFor={`st-tr-${s?.id ?? 'new'}`}>Tournament<span className="opt">optional</span></label><select id={`st-tr-${s?.id ?? 'new'}`} name="tournamentId" className="sel" defaultValue={s?.tournamentId ?? ''}><option value="">Not linked to a tournament</option>{tournaments.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        <div className="fld">
          <label htmlFor={`st-r-${s?.id ?? 'new'}`}>Rows</label>
          <textarea id={`st-r-${s?.id ?? 'new'}`} name="rows" className="inp font-mono text-[13px]" rows={8} required defaultValue={s ? standingRows(s.rows).map((r) => `${r.name}, ${r.played}, ${r.won}, ${r.lost}, ${r.points}`).join('\n') : ''} placeholder={'Falcons, 3, 3, 0, 9\nNasr Esports, 3, 2, 1, 6'} />
          <span className="help">One per line, top first: name, played, won, lost, points. You can paste from a spreadsheet.</span>
        </div>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <div className="fld"><label htmlFor={`st-q-${s?.id ?? 'new'}`}>Going through</label><input id={`st-q-${s?.id ?? 'new'}`} name="qualify" type="number" min={0} max={64} className="inp" defaultValue={s?.qualify ?? 2} /><span className="help">Rows at the top that are highlighted.</span></div>
        </div>
        <label className="switch"><input type="checkbox" name="published" defaultChecked={s?.published ?? true} /> <span>Show on the website</span></label>
      </>
    );
  };
  return (
    <>
      <div className="toolbar">
        <span className="grow text-[13px] text-muted">Round robin and Swiss tables are worked out from results. Add tables here for anything else, like groups played offline or a season ranking.</span>
        {canEdit && <FormDialog action={saveStandingTable.bind(null, slug, null)} className="btn primary" label={<><Icon name="plus" size={16} /> Add standings</>} title="Add standings" submitLabel="Add standings" wide>{form()}</FormDialog>}
      </div>
      {tables.length === 0 ? (
        <div className="card empty"><div className="ic"><Icon name="chart" /></div><h3>No standings added</h3><p>Tables you add appear on the website’s Standings page, next to the ones worked out from results.</p></div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {tables.map((s) => {
            const rows = standingRows(s.rows);
            return (
              <section key={s.id} className="card">
                <div className="card-h">
                  <h2>{s.title}</h2>
                  <span className={`badge ${s.published ? 'b-ok' : 'b-neutral'}`}>{s.published ? 'On the website' : 'Draft'}</span>
                  <div className="r flex gap-1">
                    {canEdit && <FormDialog action={saveStandingTable.bind(null, slug, s.id)} className="btn ghost sm" label="Edit" title={`Edit ${s.title}`} submitLabel="Save" wide>{form(s)}</FormDialog>}
                    {canEdit && <ConfirmButton action={deleteStandingTable.bind(null, slug, s.id)} className="btn ghost sm text-danger" label="Delete" title={`Delete ${s.title}?`} confirmLabel="Delete table" body={<p className="m-0">The table disappears from the website straight away. Results and brackets aren’t affected.</p>} />}
                  </div>
                </div>
                <div className="card-b !pt-1">
                  <table className="tbl !min-w-0"><thead><tr><th className="w-[40px]">#</th><th>Name</th><th>P</th><th>W</th><th>L</th><th>Pts</th></tr></thead>
                    <tbody>{rows.map((r, i) => <tr key={i} className={i < s.qualify ? 'bg-ok-soft/40' : ''}><td>{i + 1}</td><td className="font-semibold">{r.name}</td><td>{r.played}</td><td>{r.won}</td><td>{r.lost}</td><td className="font-semibold">{r.points}</td></tr>)}</tbody>
                  </table>
                  <p className="m-0 mt-2 text-[12px] text-muted">{tournaments.find((t) => t.id === s.tournamentId)?.name ?? 'Not linked to a tournament'} · updated {formatDate(s.updatedAt, tz)}</p>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
