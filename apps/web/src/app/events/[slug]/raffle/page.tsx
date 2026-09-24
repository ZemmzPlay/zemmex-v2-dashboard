import type { Metadata } from 'next';
import { prisma } from '@zemmz/db';
import { eventType, formatShortDateTime, shortTitle } from '@zemmz/shared';
import { can, requirePermission } from '@/lib/auth';
import { fullName } from '@/lib/format';
import { drawWinner } from './actions';
import { poolWhere } from '@/lib/raffle';
import { RaffleClient } from './raffle-client';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { event } = await requirePermission((await params).slug, can.seeDashboard);
  return { title: eventType(event.type).raffle };
}

export default async function RafflePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, event } = await requirePermission(slug, can.seeDashboard);
  const TY = eventType(event.type);

  const [sessions, wins] = await Promise.all([
    prisma.session.findMany({ where: { eventId: event.id, status: { not: 'UPCOMING' } }, orderBy: [{ startsAt: 'asc' }, { sortOrder: 'asc' }] }),
    prisma.raffleDraw.findMany({ where: { eventId: event.id }, orderBy: { drawnAt: 'desc' }, include: { registration: true } }),
  ]);
  const defs: [string, string][] = [
    ['in', `Everyone who ${TY.gates ? 'came in' : 'checked in'}`],
    ['all', `All ${TY.guests}`],
    ...sessions.map((s): [string, string] => [s.id, `${TY.gates ? 'Came through' : 'Checked in to'} ${shortTitle(s.title)}`]),
  ];
  const pools = await Promise.all(
    defs.map(async ([value, label]) => {
      const [count, countNew] = await Promise.all([
        prisma.registration.count({ where: poolWhere(event.id, value, false) }),
        prisma.registration.count({ where: poolWhere(event.id, value, true) }),
      ]);
      return { value, label, count, countNew };
    }),
  );
  // Names for the on-screen reel only.
  const reel = (await prisma.registration.findMany({ where: poolWhere(event.id, 'in', false), select: { title: true, firstName: true, lastName: true }, take: 60 })).map(fullName);

  return (
    <>
      <div className="ph">
        <div>
          <h1>{TY.raffle}</h1>
          <p>Pick a random winner, fairly, in front of the audience. Every draw is recorded in the activity log.</p>
        </div>
      </div>
      <RaffleClient
        pools={pools}
        reel={reel}
        defaultPrize={wins[0]?.prize ?? ''}
        idName={TY.idName}
        draw={drawWinner.bind(null, slug)}
        canDraw={can.editContent(user.role)}
      />
      <section className="card mt-4">
        <div className="card-h"><h2>Winners so far</h2><span className="sub">{wins.length}</span></div>
        <div className="card-b">
          {wins.length ? (
            <ul className="m-0 list-none p-0">
              {wins.map((w) => (
                <li key={w.id} className="flex flex-wrap justify-between gap-2 border-b border-line py-2.5 text-[13.5px] last:border-0">
                  <span><b className="font-semibold">{fullName(w.registration)}</b> <span className="text-muted">· ID {w.registration.publicId} · {w.prize}</span></span>
                  <span className="text-muted">{formatShortDateTime(w.drawnAt, event.timezone)}{w.drawnByLabel && ` · drawn by ${w.drawnByLabel}`}</span>
                </li>
              ))}
            </ul>
          ) : <p className="m-0 text-muted">No winners yet.</p>}
        </div>
      </section>
    </>
  );
}
