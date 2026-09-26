import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@zemmz/db';
import { can, requireUser } from '@/lib/auth';
import { fmt } from '@/lib/format';
import { DashboardShell } from '@/components/shell/dashboard-shell';
import { FormDialog } from '@/components/form-dialog';
import { ConfirmButton } from '@/components/confirm-button';
import { Icon } from '@/components/icon';
import { playAccess } from '@/lib/play/billing';
import { createProject, setProjectArchived } from './actions';

export const metadata: Metadata = { title: 'zemmz Play' };

const TZS: [string, string][] = [['Asia/Dubai', 'Dubai, Muscat (GST)'], ['Asia/Riyadh', 'Riyadh, Kuwait, Doha (AST)'], ['Asia/Kuwait', 'Kuwait'], ['Africa/Cairo', 'Cairo'], ['Asia/Amman', 'Amman'], ['Europe/Istanbul', 'Istanbul']];

/** Tournament websites: each has its own players, tournaments and theme. */
export default async function PlayHome({ searchParams }: { searchParams: Promise<{ tab?: string; new?: string }> }) {
  const user = await requireUser();
  const { tab = 'active', new: openNew } = await searchParams;
  const [projects, org] = await Promise.all([
    prisma.playProject.findMany({ where: { organisationId: user.organisationId }, orderBy: { createdAt: 'asc' }, include: { _count: { select: { players: true, tournaments: true } } } }),
    prisma.organisation.findUniqueOrThrow({ where: { id: user.organisationId } }),
  ]);
  const access = await playAccess(org);
  const list = projects.filter((p) => (tab === 'archived' ? p.archivedAt : !p.archivedAt));
  const manage = can.manageEvent(user.role);
  const dialog = (
    <FormDialog action={createProject} label={<><Icon name="plus" size={16} /> New website</>} className="btn primary" title="New tournament website" submitLabel="Create website">
      <div className="fld"><label htmlFor="np-n">Name<span className="req">*</span></label><input id="np-n" name="name" className="inp" placeholder="For example, Qatar Winter Cup" required maxLength={80} autoFocus /></div>
      <div className="fld">
        <label htmlFor="np-s">Web address</label>
        <div className="flex items-stretch overflow-hidden rounded-[10px] border border-line"><input id="np-s" name="slug" className="inp !rounded-none !border-0" placeholder="winter-cup" maxLength={50} /><span className="grid place-items-center bg-surface-2 px-3 text-[13px] text-muted">.zemmz.gg</span></div>
        <span className="help">Left empty, it’s made from the name. On Season you can connect your own domain.</span>
      </div>
      <div className="fld"><label htmlFor="np-d">Description<span className="opt">optional</span></label><textarea id="np-d" name="description" className="inp" maxLength={300} placeholder="What is this website for?" /></div>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <div className="fld !mb-0"><label htmlFor="np-l">Website languages</label><select id="np-l" name="language" className="sel" defaultValue="BOTH"><option value="BOTH">English and Arabic</option><option value="EN">English only</option><option value="AR">Arabic only</option></select></div>
        <div className="fld !mb-0"><label htmlFor="np-tz">Timezone</label><select id="np-tz" name="timezone" className="sel">{TZS.map(([z, l]) => <option key={z} value={z}>{l}</option>)}</select></div>
      </div>
    </FormDialog>
  );

  return (
    <DashboardShell user={user} product="play">
      <div className="ph">
        <div><h1>Tournament websites</h1><p>Each website has its own players, tournaments and theme, in English and Arabic.</p></div>
        {manage && <div className="actions">{dialog}</div>}
      </div>
      {openNew && manage && <p className="notice info">Choose New website to start. {access.state === 'none' ? 'Your first website starts a 14-day free trial of the Season plan.' : ''}</p>}
      <nav className="tabs" aria-label="Websites">
        {[['active', 'Active'], ['archived', 'Archived']].map(([k, l]) => (
          <Link key={k} href={`/play?tab=${k}`} aria-current={tab === k ? 'page' : undefined}>{l} <span className="muted">{projects.filter((p) => (k === 'archived' ? p.archivedAt : !p.archivedAt)).length}</span></Link>
        ))}
      </nav>
      {list.length === 0 ? (
        <div className="card empty">
          <div className="ic"><Icon name="trophy" size={24} /></div>
          <h3>{tab === 'archived' ? 'No archived websites' : 'Create your first tournament website'}</h3>
          <p>{tab === 'archived' ? 'Archived websites are offline and read-only. Archive one from its card.' : 'A website is one league or cup: its players sign up there, and you run its tournaments from here. Your first one starts a 14-day free trial.'}</p>
          {tab !== 'archived' && manage && dialog}
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {list.map((p) => (
            <div key={p.id} className="card flex flex-col">
              <div className="card-b flex flex-1 flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="proj-mark !h-[42px] !w-[42px]" style={{ background: p.colour }}>{p.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/play/${p.slug}`} className="block truncate text-[15px] font-semibold">{p.name}</Link>
                    <div className="muted text-[12.5px]">{p.slug}.zemmz.gg</div>
                  </div>
                </div>
                <p className="m-0 flex-1 text-[13.5px] text-muted">{p.description || 'Tournament website.'}</p>
                <div className="text-[12.5px] text-muted">{fmt(p._count.players)} players · {fmt(p._count.tournaments)} tournaments</div>
              </div>
              <div className="flex gap-2 border-t border-line p-3">
                {p.archivedAt ? (
                  manage && <form action={setProjectArchived.bind(null, p.slug, false)} className="flex-1"><button className="btn secondary sm w-full">Restore</button></form>
                ) : (
                  <>
                    <Link href={`/play/${p.slug}`} className="btn primary sm flex-1">Open</Link>
                    <a href={`/p/${p.slug}`} target="_blank" rel="noopener" className="btn secondary sm"><Icon name="ext" size={15} /> Visit</a>
                    {manage && <ConfirmButton action={setProjectArchived.bind(null, p.slug, true)} label="Archive" className="btn ghost sm" title={`Archive ${p.name}?`} body="The website goes offline and players can’t sign in. Tournaments, players and results are kept, and you can restore it later." confirmLabel="Archive website" />}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-6 text-[13px] text-muted">{access.state === 'trial' ? 'Free trial of Season.' : access.state === 'active' ? 'zemmz Play plan active.' : access.state === 'lapsed' ? 'Your plan has ended.' : ''} <Link href="/play/plan">Plan and billing</Link></p>
    </DashboardShell>
  );
}
