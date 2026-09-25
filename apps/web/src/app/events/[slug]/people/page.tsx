import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma, type Person } from '@zemmz/db';
import { eventType, type EventTypeDef } from '@zemmz/shared';
import { can, requirePermission } from '@/lib/auth';
import { Avatar } from '@/components/avatar';
import { ConfirmButton } from '@/components/confirm-button';
import { FormDialog } from '@/components/form-dialog';
import { Icon } from '@/components/icon';
import { SearchBox } from '@/components/search-box';
import { Uploader } from '@/components/uploader';
import { deletePerson, savePerson } from './actions';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { event } = await requirePermission((await params).slug, can.seeDashboard);
  return { title: eventType(event.type).people };
}

export default async function PeoplePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string; cat?: string }> }) {
  const { slug } = await params;
  const { q = '', cat = 'all' } = await searchParams;
  const { user, event } = await requirePermission(slug, can.seeDashboard);
  const TY = eventType(event.type);
  const edit = can.editContent(user.role);
  const base = `/events/${slug}/people`;

  const all = await prisma.person.findMany({ where: { eventId: event.id }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: { photo: { select: { id: true, key: true } } } });
  const rank = (c: string) => (TY.cats.includes(c) ? TY.cats.indexOf(c) : TY.cats.length);
  const needle = q.trim().toLowerCase();
  const rows = all
    .filter((p) => (cat === 'all' || p.category === cat) && (!needle || p.name.toLowerCase().includes(needle)))
    .sort((a, b) => rank(a.category) - rank(b.category) || a.sortOrder - b.sortOrder);
  const highlight = new Map(TY.highlights);
  const href = (c: string) => `${base}?${new URLSearchParams({ ...(q ? { q } : {}), ...(c !== 'all' ? { cat: c } : {}) })}`;

  return (
    <>
      <div className="ph">
        <div>
          <h1>{TY.people}</h1>
          <p>{TY.gates ? 'Artists on the Line-up page, with set times and biographies.' : `Shown on the ${TY.people} page, with their biographies.`}</p>
        </div>
        {edit && (
          <div className="actions">
            <FormDialog action={savePerson.bind(null, slug, null)} label={<><Icon name="plus" size={16} /> Add {TY.person}</>} className="btn primary" title={`Add ${TY.person}`} submitLabel={`Add ${TY.person}`} wide>
              <PersonFields TY={TY} nextOrder={(all.at(-1)?.sortOrder ?? 0) + 1} />
            </FormDialog>
          </div>
        )}
      </div>

      <div className="toolbar">
        <SearchBox placeholder="Search by name" label={`Search ${TY.people.toLowerCase()}`} />
        <div className="seg" role="group" aria-label="Category">
          {['all', ...TY.cats].map((c) => (
            <Link key={c} href={href(c)} aria-current={cat === c ? 'true' : undefined} scroll={false}>
              {c === 'all' ? 'All' : c} · {c === 'all' ? all.length : all.filter((p) => p.category === c).length}
            </Link>
          ))}
        </div>
      </div>

      {rows.length ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Name</th><th>Category</th><th>{TY.gates ? 'Set time' : 'Order'}</th><th>Homepage</th>{edit && <th className="text-right">Action</th>}</tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <Avatar name={p.name.replace(/^(Prof\.|Dr\.?)\s/, '')} size={40} shape={TY.shape} src={p.photo ? `/files/${p.photo.key}` : undefined} />
                      <div className="min-w-0">
                        <b className="font-semibold">{p.name}</b>
                        <div className="muted max-w-[420px] truncate">{p.bio || 'No biography yet'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap">{p.category}{TY.catSfx}</td>
                  <td className="num !text-left">{TY.gates ? p.setTime || <span className="muted">Not set</span> : p.sortOrder}</td>
                  <td>{highlight.get(p.highlight) ? <span className="badge b-info">{highlight.get(p.highlight)}</span> : <span className="muted">–</span>}</td>
                  {edit && (
                    <td className="whitespace-nowrap text-right">
                      <div className="inline-flex gap-2">
                        <FormDialog action={savePerson.bind(null, slug, p.id)} label="Edit" className="btn secondary sm" title={`Edit ${p.name}`} submitLabel="Save changes" wide>
                          <PersonFields TY={TY} person={p} />
                          <div className="fld !mb-0 mt-4">
                            <span className="lbl">Photo</span>
                            <div className="flex flex-wrap items-center gap-4">
                              <Avatar name={p.name.replace(/^(Prof\.|Dr\.?)\s/, '')} size={72} shape={TY.shape} src={p.photo ? `/files/${p.photo.key}` : undefined} />
                              <Uploader slug={slug} kind="PERSON_PHOTO" target={p.id} label={p.photo ? 'Replace photo' : 'Upload photo'} accept="image/png,image/jpeg,image/webp" hint={TY.shape === 'hex' ? 'Shown in a hexagon; a square portrait works best.' : 'Square photos work best. Up to 5 MB.'} />
                            </div>
                          </div>
                        </FormDialog>
                        <ConfirmButton
                          action={deletePerson.bind(null, slug)}
                          hidden={{ id: p.id }}
                          label="Delete"
                          className="btn danger-ghost sm"
                          title={`Delete ${p.name}?`}
                          body={`They disappear from the ${TY.people} page and the homepage straight away.`}
                          confirmLabel={`Delete ${TY.person}`}
                        />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card empty">
          <div className="ic"><Icon name={TY.gates ? 'music' : 'users'} size={24} /></div>
          <h3>{all.length ? 'Nobody matches' : `No ${TY.people.toLowerCase()} yet`}</h3>
          <p>{all.length ? 'Try another name or category.' : `Add the first ${TY.person}. The website shows them as soon as they’re saved. Add a photo with Edit.`}</p>
        </div>
      )}
    </>
  );
}

function PersonFields({ TY, person, nextOrder }: { TY: EventTypeDef; person?: Person; nextOrder?: number }) {
  const id = (k: string) => `${k}-${person?.id ?? 'new'}`;
  return (
    <>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <div className="fld">
          <label htmlFor={id('n')}>Name<span className="req">*</span></label>
          <input id={id('n')} name="name" className="inp" defaultValue={person?.name} required maxLength={120} autoFocus placeholder={TY.gates ? 'For example, The Night Shift' : TY.credits ? 'For example, Prof. Jane Smith' : 'For example, Jane Smith'} />
        </div>
        <div className="fld">
          <label htmlFor={id('c')}>Category</label>
          <select id={id('c')} name="category" className="sel" defaultValue={person?.category ?? TY.cats[0]}>
            {TY.cats.map((c) => <option key={c} value={c}>{c}{TY.catSfx}</option>)}
          </select>
        </div>
      </div>
      <div className="fld">
        <label htmlFor={id('b')}>Biography<span className="opt">optional</span></label>
        <textarea id={id('b')} name="bio" className="inp !min-h-[130px]" defaultValue={person?.bio} maxLength={4000} />
        <span className="help">Shown when visitors select this {TY.person} on the website.</span>
      </div>
      <div className="grid gap-x-4 sm:grid-cols-2">
        {TY.gates ? (
          <div className="fld !mb-0">
            <label htmlFor={id('x')}>Set time<span className="opt">optional</span></label>
            <input id={id('x')} name="setTime" className="inp" defaultValue={person?.setTime} placeholder="21:30–22:15" maxLength={40} />
          </div>
        ) : (
          <div className="fld !mb-0">
            <label htmlFor={id('o')}>Display order</label>
            <input id={id('o')} name="sortOrder" type="number" min={1} step={1} className="inp" defaultValue={person?.sortOrder ?? nextOrder} />
            <span className="help">Lower numbers appear first within the category.</span>
          </div>
        )}
        <div className="fld !mb-0">
          <label htmlFor={id('h')}>Also show on the homepage as</label>
          <select id={id('h')} name="highlight" className="sel" defaultValue={person?.highlight ?? ''}>
            <option value="">Don’t show</option>
            {TY.highlights.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
      </div>
    </>
  );
}
