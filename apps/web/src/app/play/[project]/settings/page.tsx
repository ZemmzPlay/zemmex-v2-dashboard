import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@zemmz/db';
import { arabicOf, formatDate, formatTime } from '@zemmz/shared';
import { playCan, requireProject } from '@/lib/play/core';
import { SimpleForm } from '@/components/simple-form';
import { ConfirmButton } from '@/components/confirm-button';
import { ArabicInput } from '@/components/arabic-input';
import { archiveProject, saveProject } from './actions';

export const metadata: Metadata = { title: 'Settings' };

const TZS: [string, string][] = [['Asia/Dubai', 'Dubai, Muscat (GST)'], ['Asia/Riyadh', 'Riyadh (AST)'], ['Asia/Kuwait', 'Kuwait'], ['Asia/Qatar', 'Doha'], ['Asia/Bahrain', 'Manama'], ['Africa/Cairo', 'Cairo'], ['Asia/Amman', 'Amman'], ['Asia/Beirut', 'Beirut'], ['Asia/Baghdad', 'Baghdad'], ['Africa/Casablanca', 'Casablanca'], ['Europe/Istanbul', 'Istanbul'], ['UTC', 'UTC']];

export default async function Settings({ params, searchParams }: { params: Promise<{ project: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { project: slug } = await params;
  const { tab = 'details' } = await searchParams;
  const { user, project } = await requireProject(slug);
  const manage = playCan.manageProject(user.role);
  const base = `/play/${slug}/settings`;
  const log = tab === 'log' ? await prisma.playActivity.findMany({ where: { projectId: project.id }, orderBy: { createdAt: 'desc' }, take: 200 }) : [];
  const ar = arabicOf(project);
  return (
    <>
      <div className="ph"><div><h1>Settings</h1><p>Details for {project.name}. People and plan are shared with the rest of your organisation.</p></div></div>
      <nav className="tabs" aria-label="Settings">
        <Link href={base} aria-current={tab !== 'log' ? 'page' : undefined}>Details</Link>
        <Link href={`${base}?tab=log`} aria-current={tab === 'log' ? 'page' : undefined}>Activity</Link>
      </nav>
      {tab === 'log' ? (
        <div className="tbl-wrap">
          {log.length ? (
            <table className="tbl"><thead><tr><th>Who</th><th>What happened</th><th>When</th></tr></thead>
              <tbody>{log.map((l) => <tr key={l.id}><td className="whitespace-nowrap">{l.actorLabel}</td><td>{l.action}</td><td className="muted whitespace-nowrap">{formatDate(l.createdAt, project.timezone)}, {formatTime(l.createdAt, project.timezone)}</td></tr>)}</tbody>
            </table>
          ) : <div className="empty"><h3>Nothing yet</h3><p>Changes to tournaments, results and players are listed here.</p></div>}
        </div>
      ) : (
        <>
          <SimpleForm action={saveProject.bind(null, slug)} submitLabel="Save" canEdit={manage}>
            <section className="fsec">
              <h2>Website</h2>
              <p className="hint">The name shows in the website header, browser tabs and emails to players.</p>
              <div className="fld"><label htmlFor="p-n">Name</label><input id="p-n" name="name" className="inp" required maxLength={80} defaultValue={project.name} /></div>
              {project.siteLanguage !== 'EN' && <ArabicInput name="name" label="Name" defaultValue={typeof ar.name === 'string' ? ar.name : ''} maxLength={80} />}
              <div className="fld"><label>Web address</label><p className="m-0 text-[14px]"><a href={`/p/${slug}`} target="_blank" rel="noopener">{slug}.zemmz.gg</a></p><span className="help">The address can’t change once players have it. To use your own domain, <Link href="/contact?about=play">contact us</Link>.</span></div>
              <div className="grid gap-x-4 sm:grid-cols-2">
                <div className="fld !mb-0"><label htmlFor="p-l">Languages</label><select id="p-l" name="language" className="sel" defaultValue={project.siteLanguage}><option value="BOTH">English and Arabic</option><option value="EN">English only</option><option value="AR">Arabic only</option></select></div>
                <div className="fld !mb-0"><label htmlFor="p-tz">Timezone</label><select id="p-tz" name="timezone" className="sel" defaultValue={project.timezone}>{(TZS.some(([z]) => z === project.timezone) ? TZS : [[project.timezone, project.timezone] as [string, string], ...TZS]).map(([z, l]) => <option key={z} value={z}>{l}</option>)}</select><span className="help">For new tournaments; each keeps its own.</span></div>
              </div>
            </section>
          </SimpleForm>
          {manage && (
            <section className="card card-b mt-6 max-w-[760px]">
              <h2 className="m-0 mb-1 text-[15px] font-semibold">Archive this website</h2>
              <p className="m-0 mb-3 text-[13px] text-muted">The website goes offline and stops counting towards your plan. Players, tournaments and results are kept, and you can restore it from the list of websites.</p>
              <ConfirmButton action={archiveProject.bind(null, slug)} label="Archive website" title={`Archive ${project.name}?`} confirmLabel="Archive website" body={<p className="m-0">{slug}.zemmz.gg goes offline straight away and players can’t sign in or register. Nothing is deleted.</p>} />
            </section>
          )}
        </>
      )}
    </>
  );
}
