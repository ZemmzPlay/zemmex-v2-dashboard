import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@zemmz/db';
import { arabicOf } from '@zemmz/shared';
import { playCan, requireProject } from '@/lib/play/core';
import { fileUrl } from '@/lib/storage';
import { Icon } from '@/components/icon';
import { SimpleForm } from '@/components/simple-form';
import { Uploader } from '@/components/uploader';
import { ArabicInput } from '@/components/arabic-input';
import { PageEditor } from '@/app/events/[slug]/website/page-editor';
import { saveColour, saveHome, savePage, saveSocials } from './actions';
import { ColourForm } from './colour-form';
import { SOCIALS } from './socials';

export const metadata: Metadata = { title: 'Website' };

const TABS: [string, string][] = [['look', 'Logo and colour'], ['home', 'Homepage'], ['rules', 'Rules'], ['faq', 'FAQ'], ['social', 'Socials and sponsors']];

function dateParts(d: Date | null, tz: string) {
  if (!d) return { date: '', time: '' };
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const v = (t: string) => f.find((p) => p.type === t)?.value ?? '';
  return { date: `${v('year')}-${v('month')}-${v('day')}`, time: `${v('hour') === '24' ? '00' : v('hour')}:${v('minute')}` };
}

export default async function Website({ params, searchParams }: { params: Promise<{ project: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { project: slug } = await params;
  const { tab: raw } = await searchParams;
  const { user, project } = await requireProject(slug);
  const edit = playCan.editWebsite(user.role);
  const tab = TABS.some(([k]) => k === raw) ? raw! : 'look';
  const base = `/play/${slug}/website`;
  const bilingual = project.siteLanguage !== 'EN';
  const ar = arabicOf(project);
  const s = (k: string) => (typeof ar[k] === 'string' ? (ar[k] as string) : '');
  const logo = project.logoAssetId ? await prisma.asset.findUnique({ where: { id: project.logoAssetId } }) : null;
  const socials = (project.socials ?? {}) as Record<string, string>;
  const cd = dateParts(project.countdownAt, project.timezone);

  return (
    <>
      <div className="ph">
        <div><h1>Website</h1><p>What players see at {slug}.zemmz.gg{bilingual ? ', in English and Arabic' : ''}. Changes are live as soon as you save.</p></div>
        <div className="actions"><a href={`/p/${slug}`} target="_blank" rel="noopener" className="btn secondary"><Icon name="ext" size={16} /> View website</a></div>
      </div>
      <nav className="tabs" aria-label="Website">{TABS.map(([k, l]) => <Link key={k} href={`${base}?tab=${k}`} aria-current={tab === k ? 'page' : undefined}>{l}</Link>)}</nav>

      {tab === 'look' && (
        <div className="grid max-w-[900px] gap-4">
          <section className="card card-b">
            <h2 className="m-0 mb-1 text-[15px] font-semibold">Logo</h2>
            <p className="m-0 mb-4 text-[13px] text-muted">Shown in the website header and on shared links. A square PNG with a transparent background works best.</p>
            <div className="flex flex-wrap items-center gap-4">
              <span className="grid h-20 w-20 place-items-center overflow-hidden rounded-xl bg-[#0B0714]">{logo ? <img src={fileUrl(logo.key)} alt="Current logo" className="max-h-full max-w-full object-contain" /> : <span className="text-[12px] text-white/60">No logo</span>}</span>
              {edit && <Uploader slug={slug} endpoint={`/play/${slug}/files`} kind="PLAY_LOGO" label={logo ? 'Replace logo' : 'Upload logo'} accept="image/png,image/jpeg,image/webp,image/gif" hint="Up to 5 MB." />}
            </div>
          </section>
          <section className="card card-b">
            <h2 className="m-0 mb-1 text-[15px] font-semibold">Brand colour</h2>
            <p className="m-0 mb-4 text-[13px] text-muted">Used for buttons, links and highlights. Button text switches between white and dark automatically, and links are adjusted until they’re easy to read.</p>
            <ColourForm action={saveColour.bind(null, slug)} initial={project.colour} canEdit={edit} />
          </section>
        </div>
      )}

      {tab === 'home' && (
        <SimpleForm action={saveHome.bind(null, slug)} submitLabel="Save homepage" canEdit={edit}>
          <section className="fsec">
            <h2>Headline</h2>
            <p className="hint">The first thing players see.</p>
            <div className="fld"><label htmlFor="h-t">Headline</label><input id="h-t" name="heroTitle" className="inp" required maxLength={100} defaultValue={project.heroTitle} /></div>
            {bilingual && <ArabicInput name="heroTitle" label="Headline" defaultValue={s('heroTitle')} maxLength={100} />}
            <div className="fld"><label htmlFor="h-x">Text under the headline<span className="opt">optional</span></label><textarea id="h-x" name="heroText" className="inp" rows={2} maxLength={300} defaultValue={project.heroText} /></div>
            {bilingual && <ArabicInput name="heroText" label="Text" defaultValue={s('heroText')} textarea rows={2} maxLength={300} />}
            <div className="fld !mb-0"><label htmlFor="h-d">Description for search and shared links<span className="opt">optional</span></label><input id="h-d" name="description" className="inp" maxLength={300} defaultValue={project.description} /></div>
          </section>
          <section className="fsec">
            <h2>Countdown</h2>
            <p className="hint">Counts down on the homepage, for example to the season finals. Leave the date empty to hide it.</p>
            <div className="fld"><label htmlFor="c-l">Counting down to</label><input id="c-l" name="countdownLabel" className="inp" maxLength={60} defaultValue={project.countdownLabel} placeholder="Season finals" /></div>
            {bilingual && <ArabicInput name="countdownLabel" label="Counting down to" defaultValue={s('countdownLabel')} maxLength={60} />}
            <div className="grid gap-x-4 sm:grid-cols-2">
              <div className="fld !mb-0"><label htmlFor="c-d">Date</label><input id="c-d" name="countdownDate" type="date" className="inp" defaultValue={cd.date} /></div>
              <div className="fld !mb-0"><label htmlFor="c-t">Time ({project.timezone.replace('_', ' ')})</label><input id="c-t" name="countdownTime" type="time" className="inp" defaultValue={cd.time} /></div>
            </div>
          </section>
        </SimpleForm>
      )}

      {(tab === 'rules' || tab === 'faq') && (
        <div className="max-w-[900px]">
          <p className="mt-0 text-[13px] text-muted">{tab === 'rules' ? 'The rules every tournament on the website follows. A tournament can add its own in its description.' : 'Answers to what players ask most. Use a subheading for each question.'}</p>
          <PageEditor
            key={tab} action={savePage.bind(null, slug, tab)} pageId={tab} fixedTitle={tab === 'rules' ? 'Rules' : 'Frequently asked questions'} saveLabel="Publish"
            initial={{ title: '', bodyHtml: tab === 'rules' ? project.rulesHtml : project.faqHtml }}
            arabic={bilingual ? { title: '', bodyHtml: s(tab === 'rules' ? 'rulesHtml' : 'faqHtml') } : undefined} canEdit={edit}
          />
        </div>
      )}

      {tab === 'social' && (
        <SimpleForm action={saveSocials.bind(null, slug)} submitLabel="Save" canEdit={edit}>
          <section className="fsec">
            <h2>Social profiles</h2>
            <p className="hint">Shown as icons in the website footer. Leave empty the ones you don’t use.</p>
            <div className="grid gap-x-4 sm:grid-cols-2">
              {SOCIALS.map((x) => <div key={x.key} className="fld"><label htmlFor={`s-${x.key}`}>{x.name}</label><input id={`s-${x.key}`} name={`social_${x.key}`} className="inp" defaultValue={socials[x.key] ?? ''} placeholder={x.placeholder} inputMode="url" /></div>)}
            </div>
          </section>
          <section className="fsec">
            <h2>Sponsors</h2>
            <p className="hint">One per line, in the order to show them.</p>
            <div className="fld !mb-0"><label htmlFor="sp" className="sr-only">Sponsors</label><textarea id="sp" name="sponsors" className="inp" rows={5} defaultValue={project.sponsors.join('\n')} /></div>
          </section>
        </SimpleForm>
      )}
    </>
  );
}
