import type { Metadata } from 'next';
import { prisma, type Event } from '@zemmz/db';
import { creditsEarned, eventType, formatDateRange, formatShortDateTime, shortTitle, type EventTypeDef } from '@zemmz/shared';
import { can, requirePermission } from '@/lib/auth';
import { fmt, fullName } from '@/lib/format';
import { ActionSwitch } from '@/components/action-switch';
import { setQuickSetting } from '../actions';
import { saveAfterPage, saveCertificateRules, saveCertificateTemplate } from './actions';
import { AfterEditor } from './after-editor';
import { CertificateEditor, type Sample } from './certificate-editor';
import { RulesForm } from './rules-form';
import { RecordingField } from './recording-field';
import { deleteAsset, removeRecordingVideo, saveRecording } from '../files/actions';
import { Uploader } from '@/components/uploader';
import { VideoUploader } from '@/components/video-uploader';
import { ConfirmButton } from '@/components/confirm-button';
import { Icon } from '@/components/icon';

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
        <div data-tour="issuing" className="card kpi"><div className="l">{TY.afterLbl}</div>{issuing}<div className="d">{event.afterEventOn ? 'The homepage shows the claim form' : 'Turn on after the last session'}</div></div>
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
      <AfterMedia slug={slug} event={event} TY={TY} canEdit={canEdit} />
    </>
  );
}

async function AfterMedia({ slug, event, TY, canEdit }: { slug: string; event: Event; TY: EventTypeDef; canEdit: boolean }) {
  const [sessions, photos] = await Promise.all([
    TY.gates ? Promise.resolve([]) : prisma.session.findMany({ where: { eventId: event.id, kind: 'SESSION' }, orderBy: [{ startsAt: 'asc' }, { sortOrder: 'asc' }], include: { slides: true, recording: true } }),
    prisma.asset.findMany({ where: { eventId: event.id, kind: 'GALLERY_PHOTO' }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
  ]);
  return (
    <div className="mt-6 flex flex-col gap-4">
      {!TY.gates && (
        <section className="fsec !mb-0">
          <h2>Recordings and slides</h2>
          <p className="hint">Upload each recording (MP4, MOV or WebM, up to 4 GB) or paste a link to it on your video host, and upload the slides as a PDF (up to 25 MB). Only {TY.guests} who came can open slides when the page is for people who came.</p>
          {sessions.length ? (
            <ul className="m-0 list-none p-0">
              {sessions.map((s) => (
                <li key={s.id} className="flex flex-wrap items-start gap-3 border-t border-line py-3 first:border-t-0">
                  <div className="w-full min-w-[200px] sm:w-[260px]">
                    <b className="block text-[13.5px] font-semibold">{s.title}</b>
                    <span className="text-[12px] text-muted">{formatShortDateTime(s.startsAt, event.timezone)}</span>
                  </div>
                  {s.recording ? (
                    <div className="flex min-w-[240px] flex-1 items-start gap-2">
                      <a className="btn ghost sm" href={`/files/${s.recording.key}`} target="_blank" rel="noopener"><Icon name="sparkle" size={15} /> {s.recording.name.length > 28 ? 'Recording' : s.recording.name} · {(s.recording.size / 1048576).toFixed(0)} MB</a>
                      {canEdit && <VideoUploader slug={slug} sessionId={s.id} label="Replace" />}
                      {canEdit && <ConfirmButton action={removeRecordingVideo.bind(null, slug, s.id)} label="Remove" className="btn danger-ghost sm" title="Remove this recording?" body="The video is deleted and disappears from the after-event page." confirmLabel="Remove recording" />}
                    </div>
                  ) : (
                    <>
                      <RecordingField initial={s.recordingUrl} save={saveRecording.bind(null, slug, s.id)} label={`Recording link for ${s.title}`} disabled={!canEdit} />
                      {canEdit && <VideoUploader slug={slug} sessionId={s.id} label="Upload video" />}
                    </>
                  )}
                  <div className="flex items-start gap-2">
                    {s.slides && <a className="btn ghost sm" href={`/files/${s.slides.key}`} target="_blank" rel="noopener">{s.slides.name.length > 24 ? 'Slides (PDF)' : s.slides.name}</a>}
                    {canEdit && <Uploader slug={slug} kind="SLIDES" target={s.id} label={s.slides ? 'Replace' : 'Upload slides'} accept="application/pdf" />}
                    {canEdit && s.slides && <ConfirmButton action={deleteAsset.bind(null, slug)} hidden={{ id: s.slides.id }} label="Remove" className="btn danger-ghost sm" title="Remove these slides?" body="They disappear from the after-event page." confirmLabel="Remove slides" />}
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="m-0 text-muted">Add {TY.units} to the schedule first.</p>}
        </section>
      )}
      <section className="fsec !mb-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-[15px] font-semibold">Photos</h2>
            <p className="mb-3 mt-1 text-[12.5px] text-muted">{photos.length} of 300. PNG, JPG or WebP up to 5 MB each; choose several at once.</p>
          </div>
          {canEdit && <Uploader slug={slug} kind="GALLERY_PHOTO" label="Add photos" accept="image/png,image/jpeg,image/webp" multiple className="btn primary sm" />}
        </div>
        {photos.length ? (
          <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(130px,1fr))]">
            {photos.map((p) => (
              <figure key={p.id} className="relative m-0 overflow-hidden rounded-lg border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/files/${p.key}`} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" />
                {canEdit && (
                  <div className="absolute right-1.5 top-1.5">
                    <ConfirmButton action={deleteAsset.bind(null, slug)} hidden={{ id: p.id }} label={<Icon name="trash" size={14} />} className="btn secondary sm !h-8 !px-2" title="Remove this photo?" body="It disappears from the gallery." confirmLabel="Remove photo" />
                  </div>
                )}
              </figure>
            ))}
          </div>
        ) : <p className="m-0 text-muted">No photos yet.</p>}
      </section>
    </div>
  );
}
