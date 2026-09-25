import { certificateBodyHtml } from '@/lib/certificate';

export interface CertificateTemplateText {
  title: string;
  activityNumber: string;
  provider: string;
  bodyText: string;
  signerName: string;
  signerRole: string;
  issueDateText: string;
}

/**
 * The certificate as printed. The public claim page and the dashboard
 * preview both use this, so what organisers see is what delegates get.
 */
export function CertificateView({
  template: t,
  accent,
  organiserName,
  eventLine,
  name,
  profile,
  credits,
  sessionsText,
  idLabel,
  showActivity,
  text = { certifyThat: 'This is to certify that', activityNumber: 'Activity number' },
}: {
  template: CertificateTemplateText;
  accent: string;
  organiserName: string;
  eventLine: string;
  name: string;
  profile: string;
  credits: number;
  sessionsText: string;
  idLabel: string;
  showActivity: boolean;
  text?: { certifyThat: string; activityNumber: string };
}) {
  const serif = { fontFamily: 'var(--serif, Georgia, "Times New Roman", serif)' };
  return (
    <article className="certificate mx-auto aspect-[1.414] w-full max-w-[980px] rounded-lg bg-white p-[6%] text-center text-[#171A2B] shadow-[0_30px_60px_-30px_rgba(0,0,0,.35)] [container-type:inline-size]" style={{ borderTop: `10px solid ${accent}` }}>
      <p className="m-0 text-[max(9px,1.4cqw)] font-bold tracking-[.14em]" style={{ color: accent }}>{organiserName.toUpperCase()}</p>
      <h2 className="mb-[1cqw] mt-[1.8cqw] text-[max(16px,4.4cqw)] font-bold leading-tight" style={serif}>{t.title}</h2>
      <p className="m-0 text-[max(9px,1.55cqw)] text-[#474B63]">{eventLine}</p>
      <p className="mb-[.5cqw] mt-[3.4cqw] text-[max(9px,1.45cqw)] text-[#686D87]">{text.certifyThat}</p>
      <p className="m-0 text-[max(15px,3.8cqw)] font-bold leading-tight" style={serif}>{name}</p>
      {profile && <p className="m-0 text-[max(9px,1.45cqw)] text-[#474B63]">{profile}</p>}
      <p className="mx-auto mt-[2.4cqw] max-w-[62ch] text-[max(9px,1.5cqw)] leading-relaxed text-[#474B63]" dangerouslySetInnerHTML={{ __html: certificateBodyHtml(t, credits, sessionsText) }} />
      {showActivity && t.activityNumber && <p className="mt-[.8cqw] text-[max(8px,1.3cqw)] text-[#686D87]">{text.activityNumber} <span className="ltr">{t.activityNumber}</span></p>}
      <div className="mt-[4cqw] flex items-end justify-between text-start text-[max(8px,1.35cqw)]">
        <div>
          <div className="mb-1 w-[22cqw] border-b border-[#171A2B]" />
          <b>{t.signerName}</b>
          <div className="text-[#686D87]">{t.signerRole}</div>
        </div>
        <div className="text-end text-[#686D87]">
          {t.issueDateText && <div>{t.issueDateText}</div>}
          <div>{idLabel}</div>
        </div>
      </div>
    </article>
  );
}
