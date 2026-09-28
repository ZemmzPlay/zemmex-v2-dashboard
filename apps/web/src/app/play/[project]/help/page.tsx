import type { Metadata } from 'next';
import { requireProject } from '@/lib/play/core';
import { playGuides } from '@/lib/play/help';
import { TourButton } from '@/components/tour';

export const metadata: Metadata = { title: 'Help' };

export default async function PlayHelp({ params, searchParams }: { params: Promise<{ project: string }>; searchParams: Promise<{ g?: string }> }) {
  const { project: slug } = await params;
  const { g } = await searchParams;
  await requireProject(slug);
  const groups = playGuides(`/play/${slug}`);
  return (
    <>
      <div className="ph" data-tour="help"><div><h1>Help</h1><p>Short guides for running your tournament website. Guides with a tour show you the real controls on screen.</p></div></div>
      <div className="flex max-w-[900px] flex-col gap-6">
        {groups.map((grp) => (
          <section key={grp.group}>
            <h2 className="m-0 mb-3 text-[15px] font-semibold">{grp.group}</h2>
            <div className="flex flex-col gap-2">
              {grp.guides.map((x) => (
                <details key={x.id} id={x.id} className="card" open={g === x.id}>
                  <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
                    <span className="flex-1"><b className="block text-[14.5px]">{x.title}</b><span className="text-[13px] text-muted">{x.summary}</span></span>
                    {x.tour && <span className="badge b-info">Tour</span>}
                  </summary>
                  <div className="border-t border-line p-4">
                    <ol className="m-0 flex flex-col gap-1.5 pl-5 text-[14px]">{x.steps.map((s) => <li key={s}>{s}</li>)}</ol>
                    {x.tour && <div className="mt-4"><TourButton steps={x.tour} /></div>}
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
