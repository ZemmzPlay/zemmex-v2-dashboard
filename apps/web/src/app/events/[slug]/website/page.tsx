import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma, type Event, type FormField } from '@zemmz/db';
import { eventType, formatMoney, textOn, type EventTypeDef } from '@zemmz/shared';
import { can, requirePermission } from '@/lib/auth';
import { homeState } from '@/lib/public-event';
import { builtInPages } from '@/lib/site-pages';
import { ActionSwitch } from '@/components/action-switch';
import { ConfirmButton } from '@/components/confirm-button';
import { FormDialog } from '@/components/form-dialog';
import { Icon } from '@/components/icon';
import { SimpleForm } from '@/components/simple-form';
import { PageEditor } from './page-editor';
import { ThemeForm } from './theme-form';
import { Uploader } from '@/components/uploader';
import { deleteAsset } from '../files/actions';
import {
  addField, addPage, deleteField, deletePage, editField, moveField, saveGeneral, savePage, saveTheme, saveVenue, setBuiltInInNav, setFieldFlag, setPageInNav,
} from './actions';

export const metadata: Metadata = { title: 'Website' };

const KIND_LABEL: Record<FormField['kind'], string> = { TEXT: 'Text', EMAIL: 'Email', PHONE: 'Phone', DROPDOWN: 'Dropdown', DATE: 'Date', TICKET: 'Ticket picker' };

export default async function WebsitePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string; page?: string }> }) {
  const { slug } = await params;
  const { tab = 'general', page } = await searchParams;
  const { user, event } = await requirePermission(slug, can.seeDashboard);
  const TY = eventType(event.type);
  const edit = can.editContent(user.role);
  const base = `/events/${slug}/website`;
  const paid = (await prisma.ticketType.count({ where: { eventId: event.id, priceMinor: { gt: 0 } } })) > 0;
  const tabs: [string, string][] = [['general', 'General'], ['form', paid ? 'Checkout form' : 'Registration form'], ['pages', 'Pages'], ['venue', 'Venue'], ['menu', 'Menu'], ['theme', 'Theme']];

  return (
    <>
      <div className="ph">
        <div><h1>Website</h1><p>The event website at /e/{slug}.</p></div>
        <div className="actions"><Link className="btn secondary" href={`/e/${slug}`} target="_blank" rel="noopener"><Icon name="ext" size={16} /> Open website</Link></div>
      </div>
      <nav className="tabs" aria-label="Website">
        {tabs.map(([k, l]) => <Link key={k} href={`${base}?tab=${k}`} aria-current={tab === k ? 'page' : undefined}>{l}</Link>)}
      </nav>
      {!edit && <div className="notice info mb-4">Only owners, admins and content editors can change the website.</div>}

      {tab === 'general' && <General slug={slug} event={event} TY={TY} edit={edit} />}
      {tab === 'form' && <FormBuilder slug={slug} event={event} TY={TY} edit={edit} paid={paid} />}
      {tab === 'pages' && <Pages slug={slug} event={event} TY={TY} edit={edit} current={page} />}
      {tab === 'venue' && (
        <SimpleForm action={saveVenue.bind(null, slug)} submitLabel="Save venue" canEdit={edit}>
          <section className="fsec">
            <h2>Venue page</h2>
            <p className="hint">The venue page also works as your contact page, so visitors find it in one click.</p>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <div className="fld"><label htmlFor="v-name">Venue name</label><input id="v-name" name="venueName" className="inp" defaultValue={event.venueName} maxLength={160} /></div>
              <div className="fld"><label htmlFor="v-phone">Phone for enquiries<span className="opt">optional</span></label><input id="v-phone" name="venuePhone" className="inp" defaultValue={event.venuePhone} maxLength={40} inputMode="tel" /></div>
            </div>
            <div className="fld"><label htmlFor="v-addr">Address</label><input id="v-addr" name="venueAddress" className="inp" defaultValue={event.venueAddress} maxLength={240} /><span className="help">Used for the map and the Get directions button.</span></div>
            {(event.venueName || event.venueAddress) && (
              <a className="btn secondary sm" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${event.venueName} ${event.venueAddress}`)}`} target="_blank" rel="noopener"><Icon name="pin" size={15} /> Check on Google Maps</a>
            )}
          </section>
        </SimpleForm>
      )}
      {tab === 'menu' && <Menu slug={slug} event={event} TY={TY} edit={edit} />}
      {tab === 'theme' && (
        <>
          <Logo slug={slug} event={event} edit={edit} />
          <ThemeForm action={saveTheme.bind(null, slug)} initial={event.accentColour} canEdit={edit} />
        </>
      )}
    </>
  );
}

function General({ slug, event, TY, edit }: { slug: string; event: Event; TY: EventTypeDef; edit: boolean }) {
  const state = homeState(event);
  const shows = {
    maintenance: 'the maintenance page',
    after: TY.cert === 'none' ? `the ${TY.afterLbl.toLowerCase()}` : 'the certificate claim form',
    open: TY.openForm === 'Tickets' ? 'ticket sales' : 'the registration form',
    closed: 'event information only, with no form',
  }[state];
  return (
    <div className="max-w-[760px]">
      <SimpleForm action={saveGeneral.bind(null, slug)} submitLabel="Save" canEdit={edit}>
        <section className="fsec">
          <h2>Homepage</h2>
          <p className="hint">The event name, short name and organiser are in <Link href={`/events/${slug}/settings`}>Settings</Link>.</p>
          <div className="fld !mb-0">
            <label htmlFor="g-hero">Homepage introduction<span className="opt">optional</span></label>
            <textarea id="g-hero" name="heroText" className="inp" defaultValue={event.heroText} maxLength={240} />
            <span className="help">One or two sentences under the event name. Up to 240 characters.</span>
          </div>
        </section>
        <section className="fsec">
          <h2>Website language</h2>
          <p className="hint">The language of menus, forms, tickets, certificates and confirmation emails. Your own text (event name, pages, biographies) appears as you write it.</p>
          <div className="opt-cards">
            {([['EN', 'English', 'Left to right'], ['AR', 'Arabic', 'Right to left, Arabic typeface'], ['BOTH', 'English and Arabic', 'Visitors switch in the menu']] as const).map(([v, l, d]) => (
              <label className="opt-card" key={v}>
                <input type="radio" name="siteLanguage" value={v} className="sr-only" defaultChecked={event.siteLanguage === v} />
                <b>{l}</b><small>{d}</small>
              </label>
            ))}
          </div>
        </section>
      </SimpleForm>
      <section className="fsec mt-4">
        <h2>What the homepage shows</h2>
        <p className="hint">Controlled by Quick settings on the dashboard.</p>
        <p className="m-0 text-[13.5px]">Currently: <b>{shows}</b>. <Link href={`/events/${slug}`}>Change</Link></p>
      </section>
    </div>
  );
}

async function FormBuilder({ slug, event, TY, edit, paid }: { slug: string; event: Event; TY: EventTypeDef; edit: boolean; paid: boolean }) {
  const [fields, tickets] = await Promise.all([
    prisma.formField.findMany({ where: { eventId: event.id }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
    prisma.ticketType.findMany({ where: { eventId: event.id, onSale: true }, orderBy: { sortOrder: 'asc' } }),
  ]);
  const custom = (f: FormField) => !f.locked && !['title', 'first', 'last', 'email', 'mob', 'spec', 'hosp', 'tk'].includes(f.key);
  const ink = textOn(event.accentColour);

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <div data-tour="fields" className="tbl-wrap">
          <table className="tbl !min-w-[620px]">
            <thead><tr><th className="w-8"><span className="sr-only">Locked</span></th><th>Field</th><th>Type</th><th>Shown</th><th>Required</th><th className="text-right">Order</th></tr></thead>
            <tbody>
              {fields.map((f, i) => (
                <tr key={f.id}>
                  <td className="text-muted" title={f.locked ? `Needed for ${TY.badge}s, tickets and emails` : undefined}>{f.locked && <Icon name="lock" size={15} />}</td>
                  <td>
                    <b className="font-semibold">{f.label}</b>
                    {f.kind === 'DROPDOWN' && <div className="muted max-w-[320px] truncate">{f.options.join(', ') || 'No options yet'}</div>}
                    {f.kind === 'TICKET' && <div className="muted">{tickets.map((t) => `${t.name} · ${formatMoney(t.priceMinor, event.currency, { freeLabel: true })}`).join(', ') || 'Nothing on sale'} · <Link href={`/events/${slug}/tickets`}>Edit in Tickets</Link></div>}
                  </td>
                  <td className="muted">{KIND_LABEL[f.kind]}</td>
                  <td><ActionSwitch checked={f.enabled} action={setFieldFlag.bind(null, slug, f.id, 'enabled')} label={`Show ${f.label}`} disabled={!edit || f.locked} /></td>
                  <td><ActionSwitch checked={f.required} action={setFieldFlag.bind(null, slug, f.id, 'required')} label={`${f.label} required`} disabled={!edit || f.locked || !f.enabled} /></td>
                  <td className="whitespace-nowrap text-right">
                    {edit && (
                      <span className="inline-flex items-center gap-1">
                        <form action={moveField.bind(null, slug, f.id, -1)}><button className="btn ghost sm !px-2" disabled={i === 0} aria-label={`Move ${f.label} up`}><Icon name="chevd" size={15} className="rotate-180" /></button></form>
                        <form action={moveField.bind(null, slug, f.id, 1)}><button className="btn ghost sm !px-2" disabled={i === fields.length - 1} aria-label={`Move ${f.label} down`}><Icon name="chevd" size={15} /></button></form>
                        {f.kind !== 'TICKET' && !f.locked && (
                          <FormDialog action={editField.bind(null, slug, f.id)} label="Edit" className="btn ghost sm" title={`Edit ${f.label}`} submitLabel="Save field">
                            <div className="fld"><label htmlFor={`fl-${f.id}`}>Label</label><input id={`fl-${f.id}`} name="label" className="inp" defaultValue={f.label} maxLength={60} required autoFocus /></div>
                            {f.kind === 'DROPDOWN' && <OptionsField id={f.id} value={f.options} />}
                          </FormDialog>
                        )}
                        {custom(f) && (
                          <ConfirmButton
                            action={deleteField.bind(null, slug)}
                            hidden={{ id: f.id }}
                            label={<Icon name="trash" size={15} />}
                            className="btn ghost sm !px-2 !text-danger"
                            title={`Delete the ${f.label} field?`}
                            body={`It disappears from the form. Answers people already gave stay on their records but are no longer shown. To keep them visible, turn off Shown instead.`}
                            confirmLabel="Delete field"
                          />
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {edit && (
            <FormDialog action={addField.bind(null, slug)} label={<><Icon name="plus" size={16} /> Add field</>} title="Add field" submitLabel="Add field">
              <div className="fld"><label htmlFor="nf-label">Label<span className="req">*</span></label><input id="nf-label" name="label" className="inp" maxLength={60} required autoFocus placeholder="For example, Dietary requirements" /></div>
              <div className="fld">
                <label htmlFor="nf-kind">Type of answer</label>
                <select id="nf-kind" name="kind" className="sel" defaultValue="TEXT">
                  <option value="TEXT">Text</option>
                  <option value="DROPDOWN">Dropdown</option>
                  <option value="PHONE">Phone</option>
                  <option value="DATE">Date</option>
                </select>
              </div>
              <OptionsField id="new" value={[]} />
              <label className="switch"><input type="checkbox" name="required" /> Required</label>
            </FormDialog>
          )}
          <span className="text-[12.5px] text-muted"><Icon name="lock" size={13} /> Locked fields are needed for {TY.badge}s and emails.</span>
        </div>
      </div>
      <div>
        <div className="mb-2 text-[13px] font-medium">Preview</div>
        <div data-tour="preview" className="card overflow-hidden" aria-hidden="true">
          <div className="px-4 py-3 text-[14px] font-bold" style={{ background: event.accentColour, color: ink }}>{paid ? 'Get tickets' : TY.openForm === 'Tickets' ? 'Tickets' : 'Registration'}</div>
          <div className="flex flex-col gap-2.5 p-4">
            {fields.filter((f) => f.enabled).map((f) => (
              <div key={f.id} className="text-[12.5px] font-medium text-ink-2">
                {f.label}{f.required && ' *'}
                <i className="mt-1 block h-8 rounded-lg border border-line-2 bg-surface" />
              </div>
            ))}
            <span className="mt-1 grid h-9 place-items-center rounded-lg text-[13px] font-bold" style={{ background: event.accentColour, color: ink }}>{paid ? 'Continue to payment' : 'Register now'}</span>
          </div>
        </div>
        <p className="text-[12px] text-muted">Every {TY.one} gets a unique ID automatically.</p>
      </div>
    </div>
  );
}

function OptionsField({ id, value }: { id: string; value: string[] }) {
  return (
    <div className="fld">
      <label htmlFor={`fo-${id}`}>Dropdown options<span className="opt">one per line</span></label>
      <textarea id={`fo-${id}`} name="options" className="inp" defaultValue={value.join('\n')} />
      <span className="help">Only used for dropdowns. People choose one.</span>
    </div>
  );
}

async function Pages({ slug, event, TY, edit, current }: { slug: string; event: Event; TY: EventTypeDef; edit: boolean; current?: string }) {
  const pages = await prisma.sitePage.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: 'asc' } });
  const page = pages.find((p) => p.key === current) ?? pages[0];
  const base = `/events/${slug}/website?tab=pages`;
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      <div>
        <nav className="card flex flex-col gap-0.5 p-1.5" aria-label="Pages">
          {pages.map((p) => (
            <Link key={p.id} href={`${base}&page=${p.key}`} aria-current={p.id === page?.id ? 'page' : undefined} className="rounded-lg px-3 py-2 text-[13.5px] font-medium text-ink-2 no-underline hover:bg-surface-2 aria-[current=page]:bg-brand-soft aria-[current=page]:text-brand">
              {p.title}{!p.inNav && <span className="ml-1.5 text-[11.5px] font-normal text-muted">not in menu</span>}
            </Link>
          ))}
        </nav>
        {edit && (
          <div className="mt-2">
            <FormDialog action={addPage.bind(null, slug)} label={<><Icon name="plus" size={16} /> Add page</>} className="btn secondary w-full" title="Add page" submitLabel="Add page">
              <div className="fld !mb-0"><label htmlFor="np-title">Title<span className="req">*</span></label><input id="np-title" name="title" className="inp" maxLength={60} required autoFocus placeholder="For example, Accommodation" /><span className="help">New pages start out of the menu. Add them in Menu when they’re ready.</span></div>
            </FormDialog>
          </div>
        )}
        <p className="mt-2 px-1 text-[12px] text-muted">{TY.people}, {builtInPages(TY)[1][1]} and Venue pages update from their own sections.</p>
      </div>
      {page ? (
        <PageEditor
          key={page.id}
          action={savePage.bind(null, slug, page.id)}
          deleteAction={deletePage.bind(null, slug)}
          pageId={page.id}
          initial={{ title: page.title, bodyHtml: page.bodyHtml }}
          canEdit={edit}
        />
      ) : (
        <div className="card empty"><div className="ic"><Icon name="form" size={24} /></div><h3>No pages yet</h3><p>Add pages such as accommodation, FAQs or past editions.</p></div>
      )}
    </div>
  );
}

async function Menu({ slug, event, TY, edit }: { slug: string; event: Event; TY: EventTypeDef; edit: boolean }) {
  const pages = await prisma.sitePage.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: 'asc' } });
  const row = 'flex items-center gap-2.5 border-t border-line py-2.5 first:border-t-0';
  return (
    <section className="fsec max-w-[760px]">
      <h2>Website menu</h2>
      <p className="hint">Hide pages you don’t need. Hidden pages stay online but can’t be reached from the menu.</p>
      <div>
        <div className={row}><span className="flex-1 font-semibold">Home</span><span className="tag">Always shown</span></div>
        {builtInPages(TY).map(([k, label]) => (
          <div className={row} key={k}>
            <span className="flex-1 font-semibold">{label}</span>
            <ActionSwitch checked={!event.navHidden.includes(k)} action={setBuiltInInNav.bind(null, slug, k)} label={`Show ${label} in the menu`} disabled={!edit} />
          </div>
        ))}
        {pages.map((p) => (
          <div className={row} key={p.id}>
            <span className="flex-1 font-semibold">{p.title} <Link href={`/events/${slug}/website?tab=pages&page=${p.key}`} className="text-[12.5px] font-normal">Edit</Link></span>
            <ActionSwitch checked={p.inNav} action={setPageInNav.bind(null, slug, p.id)} label={`Show ${p.title} in the menu`} disabled={!edit} />
          </div>
        ))}
      </div>
    </section>
  );
}

async function Logo({ slug, event, edit }: { slug: string; event: Event; edit: boolean }) {
  const logo = event.logoAssetId ? await prisma.asset.findUnique({ where: { id: event.logoAssetId } }) : null;
  return (
    <section className="fsec max-w-[760px]">
      <h2>Logo</h2>
      <p className="hint">Shown in the website header and on {eventType(event.type).badge}s. PNG, JPG or WebP up to 5 MB; a transparent PNG works best.</p>
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid h-20 w-40 place-items-center overflow-hidden rounded-xl border border-line bg-white p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo ? <img src={`/files/${logo.key}`} alt="Current logo" className="max-h-full max-w-full object-contain" /> : <span className="text-[12.5px] text-muted">No logo yet</span>}
        </div>
        {edit && (
          <div className="flex flex-wrap items-start gap-2">
            <Uploader slug={slug} kind="LOGO" label={logo ? 'Replace logo' : 'Upload logo'} accept="image/png,image/jpeg,image/webp,image/gif" />
            {logo && <ConfirmButton action={deleteAsset.bind(null, slug)} hidden={{ id: logo.id }} label="Remove" className="btn danger-ghost sm" title="Remove the logo?" body="The website header and badges go back to the event’s short name." confirmLabel="Remove logo" />}
          </div>
        )}
      </div>
    </section>
  );
}
