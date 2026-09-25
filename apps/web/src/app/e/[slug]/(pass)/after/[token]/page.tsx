import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@zemmz/db';
import { creditsEarned, eventType, formatDateRange, formatTime, shortTitle, siteText, type Locale } from '@zemmz/shared';
import { siteTextFor } from '@/lib/site-locale';
import { getPublicEvent, homeState } from '@/lib/public-event';
import { verify } from '@/lib/order-tokens';
import { fullName } from '@/lib/format';
import { Icon } from '@/components/icon';
import { CertificateView } from '@/components/certificate-view';
import { submitEvaluation } from '../../../actions';
import { PrintLink } from '../../print-link';
import { EvaluationForm } from './evaluation-form';

export const metadata: Metadata = { title: 'After the event', robots: { index: false } };

export default async function AfterPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const event = await getPublicEvent(slug);
  const TY = eventType(event.type);
  const { t, locale } = await siteTextFor(event);
  const regId = verify('claim', token);
  const reg = regId ? await prisma.registration.findFirst({ where: { id: regId, eventId: event.id, status: 'CONFIRMED' }, include: { attendance: true, evaluation: { select: { id: true } } } }) : null;
  if (!reg) notFound();
  if (homeState(event) !== 'after') redirect(`/e/${slug}`);

  const sessions = await prisma.session.findMany({ where: { eventId: event.id }, orderBy: [{ startsAt: 'asc' }, { sortOrder: 'asc' }], include: { slides: { select: { key: true } }, recording: { select: { key: true } } } });
  const attended = sessions.filter((s) => reg.attendance.some((a) => a.sessionId === s.id));

  /* ---------- after-event page (summit, concert, gala) ---------- */
  if (TY.cert === 'none') {
    const page = await prisma.afterEventPage.findUnique({ where: { eventId: event.id } });
    if (page?.attendeesOnly && !attended.length) redirect(`/e/${slug}`);
    await prisma.afterEventPage.update({ where: { eventId: event.id }, data: { views: { increment: 1 } } }).catch(() => undefined);
    const photos = page?.showPhotos ? await prisma.asset.findMany({ where: { eventId: event.id, kind: 'GALLERY_PHOTO' }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { id: true, key: true } }) : [];
    return (
      <div>
        <p className="kick">{t.afterKick}</p>
        <h1 className="sec-t">{t.thankYou(reg.firstName)}</h1>
        <p className="sec-p">{page?.message}</p>
        {(page?.showRecordings || page?.showSlides) && (
          <section className="mb-12" aria-labelledby="rec-h">
            <h2 id="rec-h" className="mb-4 text-[22px] font-bold" style={{ fontFamily: 'var(--serif)' }}>{t.recordingsAndSlides(page.showRecordings, page.showSlides)}</h2>
            <div className="tiles">
              {sessions.filter((s) => s.kind === 'SESSION' && ((page.showRecordings && (s.recordingUrl || s.recording)) || (page.showSlides && s.slides))).map((s) => (
                <div className="tile" key={s.id}>
                  {page.showRecordings && s.recording ? (
                    <video className="block aspect-video w-full bg-black" controls preload="metadata" src={`/files/${s.recording.key}?t=${encodeURIComponent(token)}`}>
                      <a href={`/files/${s.recording.key}?t=${encodeURIComponent(token)}&download`}>{t.watch}</a>
                    </video>
                  ) : (
                    <div className="th"><Icon name={page.showRecordings && s.recordingUrl ? 'sparkle' : 'form'} size={28} /></div>
                  )}
                  <div className="tb">
                    <b>{s.title}</b>
                    <small>{s.chairs}</small>
                    <div className="mt-2 flex flex-wrap gap-3 text-[13px] font-semibold">
                      {page.showRecordings && s.recordingUrl && <a href={s.recordingUrl} target="_blank" rel="noopener noreferrer">{t.watch}</a>}
                      {page.showSlides && s.slides && <a href={`/files/${s.slides.key}?t=${encodeURIComponent(token)}&download`}>{t.downloadSlides}</a>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {!sessions.some((s) => s.kind === 'SESSION' && ((page.showRecordings && (s.recordingUrl || s.recording)) || (page.showSlides && s.slides))) && <p className="text-[var(--muted)]">{t.notYet}</p>}
          </section>
        )}
        {page?.showPhotos && (
          <section className="mb-12" aria-labelledby="ph-h">
            <h2 id="ph-h" className="mb-4 text-[22px] font-bold" style={{ fontFamily: 'var(--serif)' }}>{t.photos}</h2>
            {photos.length ? (
              <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
                {photos.map((p) => (
                  <a key={p.id} href={`/files/${p.key}?t=${encodeURIComponent(token)}`} target="_blank" rel="noopener" className="block overflow-hidden rounded-lg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/files/${p.key}?t=${encodeURIComponent(token)}`} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover transition hover:scale-[1.03]" />
                  </a>
                ))}
              </div>
            ) : <p className="text-[var(--muted)]">{t.photosSoon}</p>}
          </section>
        )}
        {page?.showSurvey && (
          <section aria-labelledby="sv-h" className="max-w-[760px]">
            <h2 id="sv-h" className="mb-2 text-[22px] font-bold" style={{ fontFamily: 'var(--serif)' }}>{t.survey}</h2>
            {reg.evaluation ? <div className="note ok">{t.surveyThanks}</div> : <EvaluationSection eventId={event.id} action={submitEvaluation.bind(null, slug, token)} type={event.type} locale={locale} />}
          </section>
        )}
      </div>
    );
  }

  /* ---------- certificates (medical, conference, workshop) ---------- */
  const cert = await prisma.certificateTemplate.findUnique({ where: { eventId: event.id } });
  if (!cert) return <div className="note warn">{t.certNotReady}</div>;
  if (attended.length < cert.minSessions) {
    return <div className="note err">{t.tooFewSessions(attended.length, cert.minSessions, reg.publicId)}</div>;
  }
  if (event.requireEvaluation && !reg.evaluation) {
    return (
      <div className="max-w-[760px]">
        <p className="kick">{t.step1of2}</p>
        <h1 className="sec-t">{t.evaluation}</h1>
        <p className="sec-p">{t.evaluationIntro}</p>
        <EvaluationSection eventId={event.id} action={submitEvaluation.bind(null, slug, token)} type={event.type} locale={locale} />
      </div>
    );
  }

  const now = new Date();
  const policy = { rule: event.creditRule, thresholdPct: event.creditThresholdPct };
  const perSession = attended.map((s) => ({ s, earned: TY.credits ? creditsEarned(s, reg.attendance.filter((a) => a.sessionId === s.id), policy, now) : 0 }));
  // Points for a session still running are not final; issuing now would lock in the wrong number.
  const counting = perSession.find((p) => p.earned === null);
  if (counting) {
    return <div className="note warn">{t.stillCounting(shortTitle(counting.s.title), formatTime(counting.s.endsAt, event.timezone, locale))}</div>;
  }
  const credits = perSession.reduce((t, p) => t + (p.earned ?? 0), 0);
  await prisma.certificateIssue.upsert({
    where: { registrationId: reg.id },
    update: { credits, sessions: attended.length, downloads: { increment: 1 } },
    create: { registrationId: reg.id, credits, sessions: attended.length, downloads: 1 },
  });
  const sessionsText = attended.length === 1 ? shortTitle(attended[0].title) : t.sessionsCount(attended.length);

  return (
    <div>
      <style>{`@media print { @page { size: A4 landscape; margin: 0; } .certificate { box-shadow: none !important; border-radius: 0 !important; width: 100% !important; min-height: 100vh; } }`}</style>
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-[26px] font-bold" style={{ fontFamily: 'var(--serif)' }}>{t.yourCertificate}</h1>
          <p className="m-0 text-[var(--ink-2)]">{TY.credits ? t.pointsLine(credits, attended.length) : t.forLine(sessionsText)}</p>
        </div>
        <PrintLink label="Print or save as PDF" />
      </div>
      <CertificateView
        template={cert}
        accent={event.accentColour}
        organiserName={event.organiserName}
        eventLine={[event.name, formatDateRange(event.startsOn, event.endsOn, 'UTC', locale), event.venueName].filter(Boolean).join(' · ')}
        name={fullName(reg)}
        profile={[reg.field1, reg.field2].filter(Boolean).join(' · ')}
        credits={credits}
        sessionsText={sessionsText}
        idLabel={`${t.v.idName} ${reg.publicId}`}
        text={{ certifyThat: t.certifyThat, activityNumber: t.activityNumber }}
        showActivity
      />
    </div>
  );
}

async function EvaluationSection({ eventId, action, type, locale }: { eventId: string; action: Parameters<typeof EvaluationForm>[0]['action']; type: string; locale: Locale }) {
  const t = siteText(eventType(type), locale);
  const questions = await prisma.evaluationQuestion.findMany({ where: { eventId }, orderBy: { sortOrder: 'asc' } });
  if (!questions.length) return <p className="text-[var(--muted)]">{t.surveyNotReady}</p>;
  return <EvaluationForm action={action} questions={questions.map((q) => ({ id: q.id, text: q.text, kind: q.kind, group: q.groupName, required: q.required }))} type={type} locale={locale} />;
}
