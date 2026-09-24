import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@zemmz/db';
import { creditsEarned, eventType, formatDateRange, formatTime, shortTitle, lowerFirst } from '@zemmz/shared';
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
  const regId = verify('claim', token);
  const reg = regId ? await prisma.registration.findFirst({ where: { id: regId, eventId: event.id, status: 'CONFIRMED' }, include: { attendance: true, evaluation: { select: { id: true } } } }) : null;
  if (!reg) notFound();
  if (homeState(event) !== 'after') redirect(`/e/${slug}`);

  const sessions = await prisma.session.findMany({ where: { eventId: event.id }, orderBy: [{ startsAt: 'asc' }, { sortOrder: 'asc' }] });
  const attended = sessions.filter((s) => reg.attendance.some((a) => a.sessionId === s.id));

  /* ---------- after-event page (summit, concert, gala) ---------- */
  if (TY.cert === 'none') {
    const page = await prisma.afterEventPage.findUnique({ where: { eventId: event.id } });
    if (page?.attendeesOnly && !attended.length) redirect(`/e/${slug}`);
    await prisma.afterEventPage.update({ where: { eventId: event.id }, data: { views: { increment: 1 } } }).catch(() => undefined);
    return (
      <div>
        <p className="kick">{TY.afterLbl.toUpperCase()}</p>
        <h1 className="sec-t">Thank you, {reg.firstName}</h1>
        <p className="sec-p">{page?.message}</p>
        {(page?.showRecordings || page?.showSlides) && (
          <section className="mb-12" aria-labelledby="rec-h">
            <h2 id="rec-h" className="mb-4 text-[22px] font-bold" style={{ fontFamily: 'var(--serif)' }}>{page.showRecordings ? 'Recordings' : 'Slides'}</h2>
            <div className="tiles">
              {sessions.filter((s) => s.kind === 'SESSION').map((s) => (
                <div className="tile" key={s.id}>
                  <div className="th"><Icon name={page.showRecordings ? 'sparkle' : 'form'} size={28} /></div>
                  <div className="tb">
                    <b>{s.title}</b>
                    <small>{s.chairs}</small>
                    <div className="mt-2 flex gap-3 text-[13px] font-semibold">
                      {page.showRecordings && <span className="text-[var(--muted)]">Recording: to be uploaded</span>}
                      {page.showSlides && <span className="text-[var(--muted)]">Slides: to be uploaded</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[13px] text-[var(--muted)]">Recordings and slides are uploaded by the organiser. File uploads are the next step for this page.</p>
          </section>
        )}
        {page?.showPhotos && (
          <section className="mb-12" aria-labelledby="ph-h">
            <h2 id="ph-h" className="mb-2 text-[22px] font-bold" style={{ fontFamily: 'var(--serif)' }}>Photos</h2>
            <p className="text-[var(--muted)]">The official photos are to be uploaded. Check back soon.</p>
          </section>
        )}
        {page?.showSurvey && (
          <section aria-labelledby="sv-h" className="max-w-[760px]">
            <h2 id="sv-h" className="mb-2 text-[22px] font-bold" style={{ fontFamily: 'var(--serif)' }}>Two-minute survey</h2>
            {reg.evaluation ? <div className="note ok">Thanks, we’ve got your answers.</div> : <EvaluationSection eventId={event.id} action={submitEvaluation.bind(null, slug, token)} />}
          </section>
        )}
      </div>
    );
  }

  /* ---------- certificates (medical, conference, workshop) ---------- */
  const cert = await prisma.certificateTemplate.findUnique({ where: { eventId: event.id } });
  if (!cert) return <div className="note warn">The certificate isn’t ready yet. Try again later.</div>;
  if (attended.length < cert.minSessions) {
    return <div className="note err">You attended {attended.length} {TY.units}; the certificate needs {cert.minSessions}. If you think this is wrong, contact the organiser with your {lowerFirst(TY.idName)} {reg.publicId}.</div>;
  }
  if (event.requireEvaluation && !reg.evaluation) {
    return (
      <div className="max-w-[760px]">
        <p className="kick">STEP 1 OF 2</p>
        <h1 className="sec-t">Evaluation</h1>
        <p className="sec-p">Your certificate is ready. {TY.credits ? 'Accreditation requires an evaluation first.' : 'Please tell us how it went first.'} It takes about three minutes.</p>
        <EvaluationSection eventId={event.id} action={submitEvaluation.bind(null, slug, token)} />
      </div>
    );
  }

  const now = new Date();
  const policy = { rule: event.creditRule, thresholdPct: event.creditThresholdPct };
  const perSession = attended.map((s) => ({ s, earned: TY.credits ? creditsEarned(s, reg.attendance.filter((a) => a.sessionId === s.id), policy, now) : 0 }));
  // Points for a session still running are not final; issuing now would lock in the wrong number.
  const counting = perSession.find((p) => p.earned === null);
  if (counting) {
    return <div className="note warn">Your CME points are still being counted: you’re checked in to {shortTitle(counting.s.title)}, which ends at {formatTime(counting.s.endsAt, event.timezone)}. Come back after it ends to get your certificate.</div>;
  }
  const credits = perSession.reduce((t, p) => t + (p.earned ?? 0), 0);
  await prisma.certificateIssue.upsert({
    where: { registrationId: reg.id },
    update: { credits, sessions: attended.length, downloads: { increment: 1 } },
    create: { registrationId: reg.id, credits, sessions: attended.length, downloads: 1 },
  });
  const sessionsText = attended.length === 1 ? shortTitle(attended[0].title) : `${attended.length} ${TY.units}`;

  return (
    <div>
      <style>{`@media print { @page { size: A4 landscape; margin: 0; } .certificate { box-shadow: none !important; border-radius: 0 !important; width: 100% !important; min-height: 100vh; } }`}</style>
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-[26px] font-bold" style={{ fontFamily: 'var(--serif)' }}>Your certificate</h1>
          <p className="m-0 text-[var(--ink-2)]">{TY.credits ? `${credits} CME points from ${attended.length} ${attended.length === 1 ? TY.unit.toLowerCase() : TY.units}.` : `For ${sessionsText}.`}</p>
        </div>
        <PrintLink label="Print or save as PDF" />
      </div>
      <CertificateView
        template={cert}
        accent={event.accentColour}
        organiserName={event.organiserName}
        eventLine={[event.name, formatDateRange(event.startsOn, event.endsOn, 'UTC'), event.venueName].filter(Boolean).join(' · ')}
        name={fullName(reg)}
        profile={[reg.field1, reg.field2].filter(Boolean).join(' · ')}
        credits={credits}
        sessionsText={sessionsText}
        idLabel={`${TY.idName} ${reg.publicId}`}
        showActivity
      />
    </div>
  );
}

async function EvaluationSection({ eventId, action }: { eventId: string; action: Parameters<typeof EvaluationForm>[0]['action'] }) {
  const questions = await prisma.evaluationQuestion.findMany({ where: { eventId }, orderBy: { sortOrder: 'asc' } });
  if (!questions.length) return <p className="text-[var(--muted)]">The survey isn’t ready yet.</p>;
  return <EvaluationForm action={action} questions={questions.map((q) => ({ id: q.id, text: q.text, kind: q.kind, group: q.groupName, required: q.required }))} />;
}
