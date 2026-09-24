import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma, type EvaluationQuestion } from '@zemmz/db';
import { eventType, formatShortDateTime, type EventTypeDef } from '@zemmz/shared';
import { can, requirePermission } from '@/lib/auth';
import { fmt, pct } from '@/lib/format';
import { ConfirmButton } from '@/components/confirm-button';
import { FormDialog } from '@/components/form-dialog';
import { Icon } from '@/components/icon';
import { deleteQuestion, moveQuestion, resetToTemplate, saveQuestion } from './actions';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { event } = await requirePermission((await params).slug, can.seeDashboard);
  return { title: eventType(event.type).evalNav };
}

const KIND_LABEL: Record<EvaluationQuestion['kind'], string> = { RATING: 'Rating 1–5', CHOICE: 'Scale 1–5', CHECK: 'Tick box', TEXT: 'Open answer' };

export default async function EvaluationPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { slug } = await params;
  const { tab = 'report' } = await searchParams;
  const { user, event } = await requirePermission(slug, can.seeDashboard);
  const TY = eventType(event.type);
  const base = `/events/${slug}/evaluation`;
  const tabs: [string, string][] = [['report', 'Report'], ['builder', 'Form builder']];
  const where = TY.cert === 'none' ? `on the ${TY.afterLbl.toLowerCase()}` : 'when they claim a certificate';

  return (
    <>
      <div className="ph">
        <div>
          <h1>{TY.evalNav}</h1>
          <p>What {TY.guests} thought {TY.gates ? 'of the night' : 'of the programme'}. They fill it in {where}.</p>
        </div>
      </div>
      <nav className="tabs" aria-label={TY.evalNav}>
        {tabs.map(([k, l]) => <Link key={k} href={`${base}?tab=${k}`} aria-current={tab === k ? 'page' : undefined}>{l}</Link>)}
      </nav>
      {tab === 'builder' ? <Builder slug={slug} eventId={event.id} TY={TY} edit={can.editContent(user.role)} /> : <Report slug={slug} eventId={event.id} tz={event.timezone} TY={TY} />}
    </>
  );
}

async function Report({ slug, eventId, tz, TY }: { slug: string; eventId: string; tz: string; TY: EventTypeDef }) {
  const [questions, responses, attended, scores, ticks, comments, commentCount] = await Promise.all([
    prisma.evaluationQuestion.findMany({ where: { eventId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
    prisma.evaluationResponse.count({ where: { eventId } }),
    prisma.registration.count({ where: { eventId, status: 'CONFIRMED', attendance: { some: {} } } }),
    prisma.evaluationAnswer.groupBy({ by: ['questionId'], where: { question: { eventId }, rating: { not: null } }, _avg: { rating: true }, _count: { rating: true } }),
    prisma.evaluationAnswer.groupBy({ by: ['questionId'], where: { question: { eventId }, checked: true }, _count: true }),
    prisma.evaluationAnswer.findMany({
      where: { question: { eventId, kind: 'TEXT' }, text: { not: '' } },
      include: { question: { select: { text: true } }, response: { select: { submittedAt: true } } },
      orderBy: { response: { submittedAt: 'desc' } },
      take: 40,
    }),
    prisma.evaluationAnswer.count({ where: { question: { eventId, kind: 'TEXT' }, text: { not: '' } } }),
  ]);

  if (!responses) {
    return (
      <div className="card empty">
        <div className="ic"><Icon name="form" size={24} /></div>
        <h3>No responses yet</h3>
        <p>{TY.guests.charAt(0).toUpperCase() + TY.guests.slice(1)} get the form {TY.cert === 'none' ? `on the ${TY.afterLbl.toLowerCase()}` : 'when they claim a certificate'}. Their answers appear here as they come in.</p>
      </div>
    );
  }

  const score = new Map(scores.map((s) => [s.questionId, s]));
  const tick = new Map(ticks.map((t) => [t.questionId, t._count]));
  const rated = questions.filter((q) => q.kind === 'RATING' || q.kind === 'CHOICE');
  const checks = questions.filter((q) => q.kind === 'CHECK');
  const ratings = questions.filter((q) => q.kind === 'RATING').map((q) => score.get(q.id)).filter((s) => s?._count.rating);
  const totalN = ratings.reduce((t, s) => t + s!._count.rating, 0);
  const overall = totalN ? ratings.reduce((t, s) => t + (s!._avg.rating ?? 0) * s!._count.rating, 0) / totalN : null;
  const maxTick = Math.max(1, ...checks.map((q) => tick.get(q.id) ?? 0));
  const groups = [...new Set(checks.map((q) => q.groupName))];

  return (
    <>
      <div className="mb-4 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
        <div className="card kpi"><div className="l">Responses</div><div className="v">{fmt(responses)}</div><div className="d">{attended ? `${pct(responses, attended)}% of people who came` : 'Nobody has checked in yet'}</div></div>
        <div className="card kpi"><div className="l">{TY.credits ? 'Average speaker rating' : 'Average rating'}</div><div className="v">{overall == null ? '–' : overall.toFixed(2)}</div><div className="d">out of 5, across every rating</div></div>
        <div className="card kpi"><div className="l">Comments</div><div className="v">{fmt(commentCount)}</div><div className="d">Open answers written</div></div>
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section className="card">
          <div className="card-h">
            <h2>{TY.credits ? 'Programme rating' : 'Ratings'}</h2><span className="sub">Average, 1–5</span>
            <div className="r"><a className="btn ghost sm" href={`/events/${slug}/evaluation/export`}><Icon name="download" size={14} /> Export CSV</a></div>
          </div>
          <div className="card-b">
            {rated.length ? (
              <div className="flex flex-col gap-3">
                {rated.map((q) => {
                  const s = score.get(q.id);
                  const avg = s?._avg.rating ?? null;
                  return (
                    <div key={q.id} className="grid grid-cols-[1fr_110px_44px] items-center gap-3 text-[13px]">
                      <span>{q.text}</span>
                      <span className="prog" aria-hidden="true"><i style={{ width: `${avg == null ? 0 : ((avg - 1) / 4) * 100}%` }} /></span>
                      <b className="text-right tabular-nums">{avg == null ? '–' : avg.toFixed(2)}</b>
                    </div>
                  );
                })}
              </div>
            ) : <p className="m-0 text-muted">No rating questions on this form.</p>}
          </div>
        </section>
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <section className="card" key={g}>
              <div className="card-h"><h2>{g || 'Ticked'}</h2><span className="sub">Ticked by</span></div>
              <div className="card-b flex flex-col gap-3">
                {checks.filter((q) => q.groupName === g).map((q) => {
                  const n = tick.get(q.id) ?? 0;
                  return (
                    <div key={q.id} className="grid grid-cols-[1fr_110px_44px] items-center gap-3 text-[13px]">
                      <span>{q.text}</span>
                      <span className="prog" aria-hidden="true"><i style={{ width: `${(n / maxTick) * 100}%` }} /></span>
                      <b className="text-right tabular-nums">{fmt(n)}</b>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          <section className="card">
            <div className="card-h"><h2>Comments</h2><span className="sub">{commentCount > comments.length ? `Latest ${comments.length}` : 'Latest first'}</span></div>
            <div className="card-b">
              {comments.length ? comments.map((c) => (
                <figure key={c.id} className="m-0 mb-2.5 border-b border-line pb-2.5 last:mb-0 last:border-0 last:pb-0">
                  <blockquote className="m-0 text-[13.5px]">“{c.text}”</blockquote>
                  <figcaption className="mt-1 text-[12px] text-muted">{c.question.text} · {formatShortDateTime(c.response.submittedAt, tz)}</figcaption>
                </figure>
              )) : <p className="m-0 text-muted">No comments yet.</p>}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

async function Builder({ slug, eventId, TY, edit }: { slug: string; eventId: string; TY: EventTypeDef; edit: boolean }) {
  const [questions, responses] = await Promise.all([
    prisma.evaluationQuestion.findMany({ where: { eventId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], include: { _count: { select: { answers: true } } } }),
    prisma.evaluationResponse.count({ where: { eventId } }),
  ]);
  const template = TY.credits ? 'KIMS template' : 'standard template';

  return (
    <>
      <div className="toolbar">
        <span className="grow text-muted">
          {TY.credits
            ? `Based on the Kuwait Institute for Medical Specialization (KIMS) standard form. ${TY.guests.charAt(0).toUpperCase() + TY.guests.slice(1)} see this before downloading their certificate.`
            : `A short survey for ${TY.guests}. Start from the template or build your own.`}
        </span>
        {edit && !responses && (
          <ConfirmButton
            action={resetToTemplate.bind(null, slug)}
            label={`Reset to ${template}`}
            className="btn secondary"
            title={`Reset to the ${template}?`}
            body={`Every question on this form is replaced with the ${template}. Nobody has answered yet, so no responses are lost.`}
            confirmLabel="Reset the form"
          />
        )}
        {edit && (
          <FormDialog action={saveQuestion.bind(null, slug, null)} label={<><Icon name="plus" size={16} /> Add question</>} className="btn primary" title="Add question" submitLabel="Add question">
            <QuestionFields />
          </FormDialog>
        )}
      </div>
      {responses > 0 && edit && <div className="notice info mb-4">{fmt(responses)} {responses === 1 ? 'person has' : 'people have'} answered. You can still add, edit and reorder questions; deleting one also deletes its answers.</div>}
      {questions.length ? (
        <ol className="card m-0 list-none p-0">
          {questions.map((q, i) => (
            <li key={q.id} className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-0">
              <span className="tag min-w-[92px] text-center">{KIND_LABEL[q.kind]}</span>
              <span className="min-w-[200px] flex-1 text-[13.5px]">
                {q.text}
                {q.groupName && <span className="text-muted"> · {q.groupName}</span>}
              </span>
              {q.required && <span className="tag">Required</span>}
              {edit && (
                <span className="flex items-center gap-1">
                  <form action={moveQuestion.bind(null, slug, q.id, -1)}><button className="btn ghost sm !px-2" disabled={i === 0} aria-label={`Move “${q.text}” up`}><Icon name="chevd" size={15} className="rotate-180" /></button></form>
                  <form action={moveQuestion.bind(null, slug, q.id, 1)}><button className="btn ghost sm !px-2" disabled={i === questions.length - 1} aria-label={`Move “${q.text}” down`}><Icon name="chevd" size={15} /></button></form>
                  <FormDialog action={saveQuestion.bind(null, slug, q.id)} label="Edit" className="btn ghost sm" title="Edit question" submitLabel="Save">
                    <QuestionFields q={q} locked={q._count.answers > 0} />
                  </FormDialog>
                  <ConfirmButton
                    action={deleteQuestion.bind(null, slug)}
                    hidden={{ id: q.id }}
                    label={<Icon name="trash" size={15} />}
                    className="btn ghost sm !px-2 !text-danger"
                    title="Delete this question?"
                    body={q._count.answers ? `“${q.text}” and its ${fmt(q._count.answers)} ${q._count.answers === 1 ? 'answer are' : 'answers are'} deleted. This can’t be undone.` : `“${q.text}” is removed from the form. Nobody has answered it yet.`}
                    confirmLabel="Delete question"
                  />
                </span>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <div className="card empty"><div className="ic"><Icon name="form" size={24} /></div><h3>No questions yet</h3><p>Add questions one by one, or start from the {template}.</p></div>
      )}
    </>
  );
}

function QuestionFields({ q, locked }: { q?: EvaluationQuestion; locked?: boolean }) {
  const id = (k: string) => `${k}-${q?.id ?? 'new'}`;
  const kinds: EvaluationQuestion['kind'][] = q?.kind === 'CHOICE' ? ['RATING', 'CHOICE', 'CHECK', 'TEXT'] : ['RATING', 'CHECK', 'TEXT'];
  return (
    <>
      <div className="fld">
        <label htmlFor={id('t')}>Question<span className="req">*</span></label>
        <input id={id('t')} name="text" className="inp" defaultValue={q?.text} required maxLength={300} autoFocus />
      </div>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <div className="fld">
          <label htmlFor={id('k')}>Answer</label>
          {locked ? (
            <>
              <input type="hidden" name="kind" value={q!.kind} />
              <input id={id('k')} className="inp" value={KIND_LABEL[q!.kind]} disabled />
              <span className="help">Answered already, so the type stays.</span>
            </>
          ) : (
            <select id={id('k')} name="kind" className="sel" defaultValue={q?.kind ?? 'RATING'}>
              {kinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          )}
        </div>
        <div className="fld">
          <label htmlFor={id('g')}>Heading for tick boxes<span className="opt">tick boxes only</span></label>
          <input id={id('g')} name="group" className="inp" defaultValue={q?.groupName} maxLength={120} placeholder="This programme…" />
        </div>
      </div>
      <label className="switch"><input type="checkbox" name="required" defaultChecked={q?.required} /> Required <span className="text-muted">(not for tick boxes)</span></label>
    </>
  );
}
