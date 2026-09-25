import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { can, requirePermission } from '@/lib/auth';
import { Icon } from '@/components/icon';
import { TourButton } from '@/components/tour';
import { helpFor } from '../data';

export const metadata: Metadata = { title: 'Help centre' };

export default async function Article({ params }: { params: Promise<{ slug: string; article: string }> }) {
  const { slug, article } = await params;
  const { event } = await requirePermission(slug, can.seeDashboard);
  const { categories, tour } = await helpFor(event);
  const cat = categories.find((c) => c.articles.some((a) => a.id === article));
  const a = cat?.articles.find((x) => x.id === article);
  if (!cat || !a) notFound();
  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb"><Link href={`/events/${slug}/help`}>Help centre</Link> <Icon name="chevr" size={12} /> <span>{cat.name}</span></nav>
      <div className="ph"><div><h1>{a.title}</h1><p>{a.summary}</p></div></div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <article className="card p-6">
          {a.tour && <div className="mb-5"><TourButton steps={tour(a.tour)} /></div>}
          <ol className="m-0 flex flex-col gap-3 pl-5 text-[14.5px] leading-relaxed marker:font-semibold marker:text-brand">
            {a.steps.map((s) => <li key={s} className="pl-1">{s}</li>)}
          </ol>
          {a.tip && <div className="notice info mt-5"><b>Tip:</b> {a.tip}</div>}
        </article>
        <aside className="card card-b">
          <h2 className="m-0 mb-2 text-[14px] font-semibold">More in {cat.name}</h2>
          <ul className="m-0 list-none p-0">
            {cat.articles.filter((x) => x.id !== a.id).map((x) => (
              <li key={x.id}><Link href={`/events/${slug}/help/${x.id}`} className="block py-1.5 text-[13.5px] no-underline">{x.title}{x.tour && <span className="tag ml-2">Tour</span>}</Link></li>
            ))}
          </ul>
        </aside>
      </div>
    </>
  );
}
