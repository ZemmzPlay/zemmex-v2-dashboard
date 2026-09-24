import type { Metadata } from 'next';
import { prisma, type Event } from '@zemmz/db';
import { creditsEarned, eventType, formatDateRange, shortTitle, type EventTypeDef } from '@zemmz/shared';
import { can, requirePermission } from '@/lib/auth';
import { fmt, fullName } from '@/lib/format';
import { ActionSwitch } from '@/components/action-switch';
import { setQuickSetting } from '../actions';
import { saveAfterPage, saveCertificateRules, saveCertificateTemplate } from './actions';
import { AfterEditor } from './after-editor';
import { CertificateEditor, type Sample } from './certificate-editor';
import { RulesForm } from './rules-form';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { event } = await requirePermission((await params).slug, can.seeDashboard);
  return { title: eventType(event.type).certNav };
}

export default async function CertificatesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, event } = await requirePermission(slug, can.seeDashboard);
  const TY = eventType(event.type);
  const issuing = (
    <div className="mt-2 flex items-center gap-3">
      <ActionSwitch checked={event.afterEventOn} action={setQuickSetting.bind(null, slug, 'afterEventOn')} label={TY.afterLbl} disabled={!can.manageEvent(user.role)} />
      <b>{event.afterEventOn ? 'On' : 'Off'}</b>
    </div>
  );
  return TY.cert === 'none'
    ? <AfterPage slug={slug} event={event} TY={TY} issuing={issuing} canEdit={can.editContent(user.role)} />
    : <Certificates slug={slug} event={event} TY={TY} issuing={issuing} canEdit={can.editContent(user.role)} canManage={can.manageEvent(user.role)} />;
}

async function Certificates({ slug, event, TY, issuing, canEdit, canManage }: { slug: string; event: Event; TY: EventTypeDef; issuing: React.ReactNode; canEdit: boolean; canManage: boolean }) {
  const cme = TY.credits;
  const [template, sessions, regs, downloaded] = await Promise.all([
    prisma.certificateTemplate.findUnique({ where: { eventId: event.id } }),
    prisma.session.findMany({ where: { eventId: event.id }, orderBy: [{ startsAt: 'asc' }, { sortOrder: 'asc' }] }),
    prisma.registration.findMany({
      where: { eventId: event.id, status: 'CONFIRMED' },
      select: { publicId: true, title: true, firstName: true, lastName: true, field1: true, field2: true, attendance: { select: { sessionId: true, inAt: true, outAt: true } } },
      orderBy: { publicId: 'asc' },
    }),
    prisma.certificateIssue.count({ where: { registration: { eventId: event.id }, downloads: { gt: 0 } } }),
  ]);
  const min = template?.minSessions ?? 1;
  const now = new Date();
  const policy = { rule: event.creditRule, thresholdPct: event.creditThresholdPct };

  // The same rules as the public claim page: attended sessions, then points per session.
  const people = regs.map((r) => {
    const attended = sessions.filter((s) => r.attendance.some((a) => a.sessionId === s.id));
    const earned = cme ? attended.map((s) => creditsEarned(s, r.attendance.filter((a) => a.sessionId === s.id), policy, now)) : [];
    return {
      r,
      attended,
      counting: earned.some((e) => e === null),
      credits: earned.reduce<number>((t, e) => t + (e ?? 0), 0),
    };
  });
  const eligible = people.filter((p) => p.attended.length >= min);
  const dist = new Map<string, number>();
  for (const p of eligible) {
    const k = cme ? (p.counting ? 'Still counting' : `${p.credits} points`) : `${p.attended.length} ${p.attended.length === 1 ? TY.unit.toLowerCase() : TY.units}`;
    dist.set(k, (dist.get(k) ?? 0) + 1);
  }
  const bars = [...dist.entries()].sort((a, b) => (parseFloat(b[0]) || -1) - (parseFloat(a[0]) || -1));
  const maxBar = Math.max(1, ...bars.map(([, n]) => n));
  const live = sessions.find((s) => s.status === 'LIVE');

  const samples: Sample[] = eligible.slice(0, 30).map(({ r, attended, credits }) => {
    const sessionsText = attended.length === 1 ? shortTitle(attended[0].title) : `${attended.length} ${TY.units}`;
    return {
      publicId: r.publicId,
      name: fullName(r),
      profile: [r.field1, r.field2].filter(Boolean).join(' · '),
      credits,
      sessionsText,
      label: `${fullName(r)} · ${cme ? `${credits} pts` : sessionsText}`,
    };
  });

  return (
    <>
      <div className="ph">
        <div>
          <h1>{TY.certNav}</h1>
          <p>Only {TY.guests} who checked in can claim a certificate.{cme ? ` Points come from the time they spent in each ${TY.unit.toLowerCase()}.` : ` Each certificate lists the ${TY.units} they attended.`}</p>
        </div>
      </div>
      <div className="mb-4 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <div className="card kpi"><div className="l">{TY.afterLbl}</div>{issuing}<div className="d">{event.afterEventOn ? 'The homepage shows the claim form' : 'Turn on after the last session'}</div></div>
        <div className="card kpi"><div className="l">Eligible</div><div className="v">{fmt(eligible.length)}</div><div className="d">Checked in to at least {min} {min === 1 ? TY.unit.toLowerCase() : TY.units}</div></div>
        <div className="card kpi"><div className="l">Not eligible</div><div className="v">{fmt(people.length - eligible.length)}</div><div className="d">{min > 1 ? `Fewer than ${min} ${TY.units}` : 'Registered but never checked in'}</div></div>
        <div className="card kpi"><div className="l">Downloaded</div><div className="v">{fmt(downloaded)}</div><div className="d">{event.afterEventOn ? 'Updating live' : 'So far'}</div></div>
      </div>

      <div className="mb-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <RulesForm
          action={saveCertificateRules.bind(null, slug)}
          cme={cme}
          initial={{ creditRule: event.creditRule, creditThresholdPct: event.creditThresholdPct, minSessions: min, requireEvaluation: event.requireEvaluation }}
          evalNav={TY.evalNav}
          unit={TY.unit.toLowerCase()}
          units={TY.units}
          canEdit={canManage}
        />
        <section className="fsec !mb-0">
          <h2>{cme ? 'Points earned so far' : `${TY.unit}s attended`}</h2>
          <p className="hint">{live ? `${shortTitle(live.title)} is still running, so these can still change.` : `Everyone eligible, by ${cme ? 'points' : `${TY.units} attended`}.`}</p>
          {bars.length ? (
            <div className="hbar">
              {bars.map(([label, n]) => (
                <div className="r" key={label}>
                  <span>{label}</span>
                  <span className="t"><i style={{ width: `${(n / maxBar) * 100}%` }} /></span>
                  <span className="n">{fmt(n)}</span>
                </div>
              ))}
            </div>
          ) : <p className="m-0 text-muted">Nobody has checked in yet.</p>}
        </section>
      </div>

      <CertificateEditor
        action={saveCertificateTemplate.bind(null, slug)}
        initial={{
          title: template?.title ?? 'Certificate of attendance',
          activityNumber: template?.activityNumber ?? '',
          provider: template?.provider ?? '',
          bodyText: template?.bodyText ?? (cme ? 'This activity is accredited by {provider} for {credits} CME points.' : 'For attending {sessions}.'),
          signerName: template?.signerName ?? '',
          signerRole: template?.signerRole ?? '',
          issueDateText: template?.issueDateText ?? '',
        }}
        samples={samples}
        cme={cme}
        accent={event.accentColour}
        organiserName={event.organiserName}
        eventLine={[event.name, formatDateRange(event.startsOn, event.endsOn, 'UTC'), event.venueName].filter(Boolean).join(' · ')}
        idName={TY.idName}
        units={TY.units}
        canEdit={canEdit}
      />
    </>
  );
}

async function AfterPage({ slug, event, TY, issuing, canEdit }: { slug: string; event: Event; TY: EventTypeDef; issuing: React.ReactNode; canEdit: boolean }) {
  const [page, attended, responses] = await Promise.all([
    prisma.afterEventPage.findUnique({ where: { eventId: event.id } }),
    prisma.registration.count({ where: { eventId: event.id, status: 'CONFIRMED', attendance: { some: {} } } }),
    prisma.evaluationResponse.count({ where: { eventId: event.id } }),
  ]);
  const what = TY.gates ? 'show' : 'event';
  return (
    <>
      <div className="ph">
        <div>
          <h1>{TY.certNav}</h1>
          <p>What the homepage shows once the {what} is over. Switch it on here or from Quick settings on the dashboard.</p>
        </div>
      </div>
      <div className="mb-4 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <div className="card kpi"><div className="l">{TY.afterLbl}</div>{issuing}<div className="d">{event.afterEventOn ? 'The homepage shows this page' : `Turn on when the ${what} ends`}</div></div>
        <div className="card kpi"><div className="l">Attended</div><div className="v">{fmt(attended)}</div><div className="d">{page?.attendeesOnly ?? true ? 'Can unlock the page' : 'Everyone registered can open it'}</div></div>
        <div className="card kpi"><div className="l">Page views</div><div className="v">{fmt(page?.views ?? 0)}</div><div className="d">{event.afterEventOn ? 'Since the page opened' : 'Not open yet'}</div></div>
        <div className="card kpi"><div className="l">Survey responses</div><div className="v">{fmt(responses)}</div><div className="d">From the {TY.afterLbl.toLowerCase()}</div></div>
      </div>
      <AfterEditor
        action={saveAfterPage.bind(null, slug)}
        initial={{
          showRecordings: page?.showRecordings ?? false,
          showSlides: page?.showSlides ?? false,
          showPhotos: page?.showPhotos ?? false,
          showSurvey: page?.showSurvey ?? false,
          attendeesOnly: page?.attendeesOnly ?? true,
          message: page?.message ?? '',
        }}
        gates={TY.gates}
        unit={TY.unit.toLowerCase()}
        idName={TY.idName}
        eventName={event.name}
        dates={formatDateRange(event.startsOn, event.endsOn, 'UTC')}
        accent={event.accentColour}
        canEdit={canEdit}
      />
    </>
  );
}
