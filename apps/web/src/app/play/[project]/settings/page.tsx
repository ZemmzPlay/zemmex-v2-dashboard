import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@zemmz/db';
import { arabicOf, formatDate, formatTime } from '@zemmz/shared';
import { playCan, PROJECT_ROLES, requireProject } from '@/lib/play/core';
import { playAccess } from '@/lib/play/billing';
import { playAddress, playDomain } from '@/lib/play/hosts';
import { domainTarget } from '@/lib/domains';
import { appUrl } from '@/lib/email';
import { ROLE_LABEL } from '@/lib/auth';
import { SimpleForm } from '@/components/simple-form';
import { ConfirmButton } from '@/components/confirm-button';
import { ArabicInput } from '@/components/arabic-input';
import { Avatar } from '@/components/avatar';
import { FormDialog } from '@/components/form-dialog';
import { archiveProject, removeDomain, saveProject, setDomain, setProjectRole, verifyDomain } from './actions';

export const metadata: Metadata = { title: 'Settings' };

const TZS: [string, string][] = [['Asia/Dubai', 'Dubai, Muscat (GST)'], ['Asia/Riyadh', 'Riyadh (AST)'], ['Asia/Kuwait', 'Kuwait'], ['Asia/Qatar', 'Doha'], ['Asia/Bahrain', 'Manama'], ['Africa/Cairo', 'Cairo'], ['Asia/Amman', 'Amman'], ['Asia/Beirut', 'Beirut'], ['Asia/Baghdad', 'Baghdad'], ['Africa/Casablanca', 'Casablanca'], ['Europe/Istanbul', 'Istanbul'], ['UTC', 'UTC']];
const TABS: [string, string][] = [['details', 'Details'], ['address', 'Web address'], ['people', 'People'], ['log', 'Activity']];

export default async function Settings({ params, searchParams }: { params: Promise<{ project: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { project: slug } = await params;
  const { tab: raw } = await searchParams;
  const tab = TABS.some(([k]) => k === raw) ? raw! : 'details';
  const { user, project } = await requireProject(slug);
  const manage = playCan.manageProject(user.role);
  const base = `/play/${slug}/settings`;
  const address = playAddress(project, appUrl());
  return (
    <>
      <div className="ph"><div><h1>Settings</h1><p>Details, address and people for {project.name}. The plan is shared with the rest of your organisation.</p></div></div>
      <nav className="tabs" aria-label="Settings">
        {TABS.map(([k, l]) => <Link key={k} href={k === 'details' ? base : `${base}?tab=${k}`} aria-current={tab === k ? 'page' : undefined}>{l}</Link>)}
      </nav>
      {tab === 'details' && <Details slug={slug} project={project} manage={manage} address={address} />}
      {tab === 'address' && <Address slug={slug} project={project} manage={manage} address={address} />}
      {tab === 'people' && <People slug={slug} projectId={project.id} organisationId={project.organisationId} manage={manage} me={user.id} name={project.name} />}
      {tab === 'log' && <Log projectId={project.id} tz={project.timezone} />}
    </>
  );
}

type P = Awaited<ReturnType<typeof requireProject>>['project'];

function Details({ slug, project, manage, address }: { slug: string; project: P; manage: boolean; address: string }) {
  const ar = arabicOf(project);
  return (
    <>
      <SimpleForm action={saveProject.bind(null, slug)} submitLabel="Save" canEdit={manage}>
        <section className="fsec">
          <h2>Website</h2>
          <p className="hint">The name shows in the website header, browser tabs and emails to players.</p>
          <div className="fld"><label htmlFor="p-n">Name</label><input id="p-n" name="name" className="inp" required maxLength={80} defaultValue={project.name} /></div>
          {project.siteLanguage !== 'EN' && <ArabicInput name="name" label="Name" defaultValue={typeof ar.name === 'string' ? ar.name : ''} maxLength={80} />}
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
          <ConfirmButton action={archiveProject.bind(null, slug)} label="Archive website" title={`Archive ${project.name}?`} confirmLabel="Archive website" body={<p className="m-0">{address} goes offline straight away and players can’t sign in or register. Nothing is deleted.</p>} />
        </section>
      )}
    </>
  );
}

async function Address({ slug, project, manage, address }: { slug: string; project: P; manage: boolean; address: string }) {
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: project.organisationId } });
  const a = await playAccess(org);
  const allowed = a.open && (a.state === 'trial' || a.plan === 'PLAY_SEASON' || a.plan === 'PLAY_PUBLISHER');
  const d = project.customDomain;
  const sub = playDomain() ? `${slug}.${playDomain()}` : null;
  const scheme = (h: string) => (/\.(test|localhost)$/.test(h) ? 'http' : 'https');
  return (
    <div className="max-w-[760px]">
      <section className="fsec">
        <h2>Where the website lives</h2>
        <p className="m-0 text-[13.5px]">Players see <b>{address}</b>. It also always works at <a href={`/p/${slug}`} target="_blank" rel="noopener">{appUrl().replace(/^https?:\/\//, '')}/p/{slug}</a>{sub && address !== sub ? <>, and at <a href={`${scheme(sub)}://${sub}`} target="_blank" rel="noopener">{sub}</a></> : null}.</p>
        <p className="m-0 mt-1 text-[12.5px] text-muted">The {sub ? `${playDomain()} address` : 'address'} comes from the website’s name when it was created and can’t change, so links players already have keep working.</p>
      </section>
      {!allowed ? (
        <div className="notice info">Showing the website on your own domain, such as play.yourleague.com, comes with the Season plan. <Link href="/play/plan" className="font-semibold">See plans</Link></div>
      ) : (
        <>
          <SimpleForm action={setDomain.bind(null, slug)} submitLabel={d ? 'Change address' : 'Continue'} canEdit={manage}>
            <section className="fsec">
              <h2>Your own domain</h2>
              <p className="hint">Use a subdomain of a domain you own. Sign-in, payments and emails follow the website to its new address.</p>
              <div className="fld !mb-0 max-w-[380px]"><label htmlFor="cd">Domain</label><input id="cd" name="domain" className="inp" defaultValue={d ?? ''} placeholder="play.yourleague.com" /></div>
            </section>
          </SimpleForm>
          {d && (
            <div className="mt-6">
              <SimpleForm action={verifyDomain.bind(null, slug)} submitLabel={project.domainVerifiedAt ? 'Check again' : 'Check the records'} canEdit={manage}>
                <section className="fsec">
                  <h2>DNS records {project.domainVerifiedAt && <span className="badge b-ok ml-2">Connected</span>}</h2>
                  <p className="hint">Add both where your domain’s DNS is managed, then check. Changes can take up to an hour to show.</p>
                  <div className="tbl-wrap">
                    <table className="tbl">
                      <thead><tr><th>Type</th><th>Name</th><th>Value</th></tr></thead>
                      <tbody>
                        <tr><td className="font-mono">CNAME</td><td className="font-mono">{d}</td><td className="break-all font-mono">{domainTarget()}</td></tr>
                        <tr><td className="font-mono">TXT</td><td className="font-mono">_zemmz.{d}</td><td className="break-all font-mono">{project.domainToken}</td></tr>
                      </tbody>
                    </table>
                  </div>
                </section>
              </SimpleForm>
              {manage && (
                <div className="mt-6">
                  <ConfirmButton action={removeDomain.bind(null, slug)} label="Remove this domain" title={`Stop using ${d}?`} body={<p className="m-0">{d} stops showing the website straight away. Players who bookmarked it will need the zemmz address.</p>} confirmLabel="Remove domain" />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

async function People({ slug, projectId, organisationId, manage, me, name }: { slug: string; projectId: string; organisationId: string; manage: boolean; me: string; name: string }) {
  const [members, overrides] = await Promise.all([
    prisma.membership.findMany({ where: { organisationId }, include: { user: true }, orderBy: { createdAt: 'asc' } }),
    prisma.playProjectMember.findMany({ where: { projectId } }),
  ]);
  const label = (r: string) => PROJECT_ROLES.find(([k]) => k === r)?.[1] ?? ROLE_LABEL[r as keyof typeof ROLE_LABEL] ?? r;
  return (
    <>
      <p className="mt-0 max-w-[760px] text-[13.5px] text-muted">
        Everyone in your organisation has their organisation role here unless you give them a different one for {name}: an admin for one league, a moderator for another, or no access at all.
        Invite new people from <Link href="/organisation">People and plan</Link>.
      </p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Name</th><th>Organisation role</th><th>On this website</th><th className="act"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {members.map((m) => {
              const o = overrides.find((x) => x.userId === m.userId);
              const locked = m.role === 'OWNER' || m.userId === me;
              return (
                <tr key={m.id}>
                  <td><div className="flex items-center gap-2.5"><Avatar name={m.user.name} size={30} /><div><b>{m.user.name}</b>{m.userId === me && <span className="tag ml-1.5">You</span>}<div className="muted text-[12.5px]">{m.user.email}</div></div></div></td>
                  <td>{ROLE_LABEL[m.role]}</td>
                  <td>{o ? <span className={`badge ${o.role === 'NONE' ? 'b-neutral' : 'b-info'}`}>{label(o.role)}</span> : <span className="muted">Same as organisation</span>}</td>
                  <td className="act">
                    {manage && !locked && (
                      <FormDialog action={setProjectRole.bind(null, slug, m.userId)} className="btn ghost sm" label="Change" title={`${m.user.name} on ${name}`} submitLabel="Save">
                        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                          <legend className="mb-2 text-[13px] text-muted">What {m.user.name.split(' ')[0]} can do on this website.</legend>
                          <label className="flex items-center gap-2 text-[14px]"><input type="radio" name="role" value="ORG" defaultChecked={!o} /> Same as organisation ({ROLE_LABEL[m.role]})</label>
                          {PROJECT_ROLES.map(([k, l]) => <label key={k} className="flex items-center gap-2 text-[14px]"><input type="radio" name="role" value={k} defaultChecked={o?.role === k} /> {l}{k === 'CHECKIN' ? ': score reports and player verification' : k === 'EDITOR' ? ': tournaments, results, players and the website' : k === 'ADMIN' ? ': everything, including settings' : ': the website is hidden from them'}</label>)}
                        </fieldset>
                      </FormDialog>
                    )}
                    {locked && <span className="muted text-[12.5px]">{m.role === 'OWNER' ? 'Owners manage every website' : ''}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

async function Log({ projectId, tz }: { projectId: string; tz: string }) {
  const log = await prisma.playActivity.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' }, take: 200 });
  return (
    <div className="tbl-wrap">
      {log.length ? (
        <table className="tbl"><thead><tr><th>Who</th><th>What happened</th><th>When</th></tr></thead>
          <tbody>{log.map((l) => <tr key={l.id}><td className="whitespace-nowrap">{l.actorLabel}</td><td>{l.action}</td><td className="muted whitespace-nowrap">{formatDate(l.createdAt, tz)}, {formatTime(l.createdAt, tz)}</td></tr>)}</tbody>
        </table>
      ) : <div className="empty"><h3>Nothing yet</h3><p>Changes to tournaments, results and players are listed here.</p></div>}
    </div>
  );
}
