import type { Metadata } from 'next';
import { prisma } from '@zemmz/db';
import { eventType } from '@zemmz/shared';
import { getPublicEvent } from '@/lib/public-event';
import { initials } from '@/lib/format';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return { title: eventType((await getPublicEvent((await params).slug)).type).people };
}

export default async function PeoplePage({ params }: { params: Promise<{ slug: string }> }) {
  const event = await getPublicEvent((await params).slug);
  const TY = eventType(event.type);
  const people = await prisma.person.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: 'asc' }, include: { photo: { select: { key: true } } } });
  const highlight = new Map(TY.highlights);
  const groups: [string, typeof people][] = TY.cats.map((c): [string, typeof people] => [c, people.filter((p) => p.category === c)]).filter(([, l]) => l.length > 0);
  const other = people.filter((p) => !TY.cats.includes(p.category));
  if (other.length) groups.push(['Also appearing', other]);

  return (
    <div className="wrap pb-20">
      <div className="page-h">
        <h1>{TY.people}</h1>
        <p className="sec-p">{TY.gates ? 'Who’s playing, in running order.' : 'Select a name to read their biography.'}</p>
      </div>
      {people.length === 0 && <p className="text-[var(--muted)]">The {TY.people.toLowerCase()} will be announced soon.</p>}
      {groups.map(([cat, list]) => (
        <section key={cat} className="mb-12" aria-labelledby={`c-${cat}`}>
          <h2 id={`c-${cat}`} className="mb-5 text-[20px] font-bold" style={{ fontFamily: 'var(--serif)', color: 'var(--accent-link, var(--accent))' }}>{cat}{TY.catSfx}</h2>
          <div className={`people shape-${TY.shape}`}>
            {list.map((p) => (
              <details className="person" key={p.id}>
                <summary>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <div className="av" aria-hidden="true">{p.photo ? <img src={`/files/${p.photo.key}`} alt="" /> : initials(p.name)}</div>
                  <b>{p.name}</b>
                  <small>{p.setTime || highlight.get(p.highlight) || `${p.category}${TY.catSfx}`}</small>
                </summary>
                {p.bio && <p>{p.bio}</p>}
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
