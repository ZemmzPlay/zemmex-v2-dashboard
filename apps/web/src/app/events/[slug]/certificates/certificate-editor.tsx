'use client';

import { useActionState, useState } from 'react';
import { CertificateView, type CertificateTemplateText } from '@/components/certificate-view';
import type { ActionState } from '@/lib/action-state';
import { keepValues } from '@/lib/use-keep-values';

export interface Sample { publicId: number; name: string; profile: string; credits: number; sessionsText: string; label: string }

/** The certificate template with a live preview for one eligible person. */
export function CertificateEditor({ action, initial, samples, cme, accent, organiserName, eventLine, idName, units, canEdit }: {
  action: (p: ActionState, fd: FormData) => Promise<ActionState>;
  initial: CertificateTemplateText;
  samples: Sample[];
  cme: boolean;
  accent: string;
  organiserName: string;
  eventLine: string;
  idName: string;
  units: string;
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [t, setT] = useState(initial);
  const [pick, setPick] = useState(samples[0]?.publicId ?? 0);
  const sample = samples.find((s) => s.publicId === pick) ?? samples[0];
  const bind = (k: keyof CertificateTemplateText) => ({ id: `ct-${k}`, name: k, value: t[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setT({ ...t, [k]: e.target.value }) });

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <form action={formAction} onSubmit={keepValues(formAction)} className="fsec !mb-0">
        <h2>Certificate template</h2>
        <p className="hint">{cme ? '{credits} becomes each delegate’s points. {provider} becomes the accrediting body.' : `{sessions} becomes the ${units} each person attended.`}</p>
        {state.error && <div className="notice err mb-4" role="alert">{state.error}</div>}
        {state.ok && !pending && <div className="notice ok mb-4" role="status">{state.ok}</div>}
        <fieldset disabled={!canEdit} className="m-0 border-0 p-0">
          <div className={`grid gap-x-4 ${cme ? 'sm:grid-cols-2' : ''}`}>
            <div className="fld"><label htmlFor="ct-title">Title</label><input className="inp" maxLength={120} required {...bind('title')} /></div>
            {cme && <div className="fld"><label htmlFor="ct-activityNumber">Activity number</label><input className="inp" maxLength={60} {...bind('activityNumber')} /></div>}
          </div>
          {cme && <div className="fld"><label htmlFor="ct-provider">Accrediting body</label><input className="inp" maxLength={160} {...bind('provider')} /></div>}
          <div className="fld">
            <label htmlFor="ct-bodyText">{cme ? 'Accreditation text' : 'Certificate text'}</label>
            <textarea className="inp !min-h-[110px]" maxLength={800} required {...bind('bodyText')} />
          </div>
          <div className="grid gap-x-4 sm:grid-cols-3">
            <div className="fld"><label htmlFor="ct-signerName">Signed by</label><input className="inp" maxLength={120} {...bind('signerName')} /></div>
            <div className="fld"><label htmlFor="ct-signerRole">Role</label><input className="inp" maxLength={120} {...bind('signerRole')} /></div>
            <div className="fld"><label htmlFor="ct-issueDateText">Date</label><input className="inp" maxLength={60} placeholder="24 September 2026" {...bind('issueDateText')} /></div>
          </div>
        </fieldset>
        {canEdit && <button className="btn primary" disabled={pending}>{pending ? 'Saving…' : 'Save certificate'}</button>}
      </form>
      <div data-tour="certpreview" className="xl:sticky xl:top-[84px]">
        {sample ? (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-2.5">
              <label htmlFor="ct-sample" className="text-[13px] font-medium">Preview for</label>
              <select id="ct-sample" className="sel min-w-0 flex-1" value={pick} onChange={(e) => setPick(Number(e.target.value))}>
                {samples.map((s) => <option key={s.publicId} value={s.publicId}>{s.label}</option>)}
              </select>
            </div>
            <CertificateView
              template={t}
              accent={accent}
              organiserName={organiserName}
              eventLine={eventLine}
              name={sample.name}
              profile={sample.profile}
              credits={sample.credits}
              sessionsText={sample.sessionsText}
              idLabel={`${idName} ${sample.publicId}`}
              showActivity={cme}
            />
          </>
        ) : (
          <div className="card empty"><h3>Nobody is eligible yet</h3><p>The preview appears once people check in.</p></div>
        )}
      </div>
    </div>
  );
}
