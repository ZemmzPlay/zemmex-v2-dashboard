import type { Metadata } from 'next';
import Link from 'next/link';
import { can, requirePermission } from '@/lib/auth';
import { Icon } from '@/components/icon';
import { TourButton } from '@/components/tour';
import { helpFor } from './data';

export const metadata: Metadata = { title: 'Help centre' };

export default async function HelpPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { event } = await requirePermission(slug, can.seeDashboard);
  const { categories, tour } = await helpFor(event);
  return (
    <>
      <div className="ph"><div><h1>Help centre</h1><p>Guides for every stage of your event. Guides marked Tour walk you through the real screen.</p></div></div>
      <div className="mb-5 flex flex-wrap items-center gap-4 rounded-2xl bg-nav p-6 text-white">
        <div className="min-w-[240px] flex-1">
          <h2 className="m-0 text-[18px] font-bold">Running your first event?</h2>
          <p className="mb-0 mt-1 text-[13.5px] text-[#B4B3D3]">Take the tour of the dashboard, then follow the guides in order: before, on the day, after.</p>
        </div>
        <TourButton steps={tour('dash')} label="Start the tour" className="btn secondary" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {categories.map((c) => (
          <section key={c.name} className="card card-b">
            <h2 className="m-0 mb-3 flex items-center gap-2 text-[15px] font-semibold"><span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-soft text-brand"><Icon name={c.icon} size={17} /></span>{c.name}</h2>
            <ul className="m-0 list-none p-0">
              {c.articles.map((a) => (
                <li key={a.id} className="border-t border-line first:border-t-0">
                  <Link href={`/events/${slug}/help/${a.id}`} className="flex items-center gap-2 py-2.5 text-[13.5px] font-medium text-ink no-underline hover:text-brand">
                    <span className="flex-1">{a.title}</span>
                    {a.tour && <span className="tag">Tour</span>}
                    <Icon name="chevr" size={14} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-6 text-[13px] text-muted">Still stuck? Email <a href="mailto:hello@zemmz.com">hello@zemmz.com</a>. On event days we reply within the hour.</p>
    </>
  );
}
