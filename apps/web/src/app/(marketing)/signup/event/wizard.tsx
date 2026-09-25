'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { contrastRatio, eventType, isHexColour, textOn, type EventTypeKey } from '@zemmz/shared';
import { OnboardingShell } from '@/components/onboarding-shell';
import { ACCREDITORS, CURRENCY_FOR_COUNTRY, fieldOptions, onboardingSteps, suggestedTickets, TZ_FOR_COUNTRY } from '@/lib/onboarding';
import { finishOnboarding, type OnboardingData } from './actions';

const TYPES: { key: EventTypeKey; colour: string; d: string; icon: string }[] = [
  { key: 'conference', colour: '#C2410C', icon: 'M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5 11a7 7 0 0 0 14 0M12 18v3', d: 'Talks, workshops and panels. Paid tickets, session check-in and certificates of attendance.' },
  { key: 'medical', colour: '#B3122E', icon: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z', d: 'Everything a conference has, plus CME points from time in the room, accredited certificates and a KIMS-style evaluation.' },
  { key: 'summit', colour: '#0E5E4E', icon: 'M3 7h18v13H3zM9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18', d: 'Founder, investor and exhibitor tickets, session check-in and recordings for people who came.' },
  { key: 'concert', colour: '#6D28D9', icon: 'M9 18V5l11-2v13M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM17 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', d: 'Ticket tiers, e-tickets, gate scanning with pass-outs and live headcounts, then an after-show page.' },
  { key: 'workshop', colour: '#0B5CFF', icon: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2ZM4 19V5M8 7h7', d: 'Small groups with limited seats, attendance tracking and certificates of completion.' },
  { key: 'exhibition', colour: '#0F766E', icon: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', d: 'Visitor badges, exhibitor passes, entrance scanning and daily footfall.' },
  { key: 'gala', colour: '#A16207', icon: 'm12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z', d: 'Invitations or tickets, guest list check-in at the door, and a raffle on the night.' },
];
const PLACEHOLDER: Record<string, [string, string]> = {
  medical: ['For example, 6th Gulf Heart Summit', 'For example, The Regency, Kuwait'], concert: ['For example, Nocturne Live: Winter', 'For example, The Waterfront Amphitheatre'],
  summit: ['For example, Majlis Founders Summit 2027', 'For example, Manarat Al Saadiyat'], conference: ['For example, Form Week 2027', 'For example, Dubai Design District'],
  workshop: ['For example, Product Design Bootcamp', 'For example, Studio 2, Hub71'], exhibition: ['For example, Gulf Home Expo', 'For example, ADNEC Hall 5'], gala: ['For example, Annual Awards Night', 'For example, Emirates Palace'],
};
const ZONES: [string, string][] = [['Asia/Dubai', 'GMT+4 · UAE and Oman'], ['Asia/Kuwait', 'GMT+3 · Kuwait'], ['Asia/Riyadh', 'GMT+3 · Saudi Arabia'], ['Asia/Qatar', 'GMT+3 · Qatar'], ['Asia/Bahrain', 'GMT+3 · Bahrain'], ['Africa/Cairo', 'Cairo'], ['Asia/Amman', 'Amman']];
const PLANS: [OnboardingData['plan'], string, string, string][] = [['EVENT', 'Single event', '1 event, up to 1,000 people', 'AED 7,500'], ['SEASON', 'Season', 'Up to 6 events a year, SMS included', 'AED 29,000/yr'], ['ENTERPRISE', 'Government and enterprise', 'Unlimited events, SSO, on-site support', 'From AED 75,000']];

const I = ({ d, s = 16 }: { d: string; s?: number }) => <svg className="i" viewBox="0 0 24 24" style={{ width: s, height: s }} aria-hidden="true"><path d={d} /></svg>;
const ARROW = 'M5 12h14M13 6l6 6-6 6';
const BACK = 'M19 12H5M11 6l-6 6 6 6';
const CHECK = 'm5 12.5 4.5 4.5L19 7.5';
const X = 'M18 6 6 18M6 6l12 12';

function Toggle({ on, onChange, title, sub }: { on: boolean; onChange: (v: boolean) => void; title: string; sub?: string }) {
  return (
    <div role="checkbox" aria-checked={on} tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => onChange(!on)} onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onChange(!on); } }}>
      <span className={`ck ${on ? 'y' : 'n'}`}>{on && <I d={CHECK} s={14} />}</span>
      <span><b style={{ fontWeight: 600 }}>{title}</b>{sub && <><br /><span style={{ color: 'var(--muted)', fontSize: 13 }}>{sub}</span></>}</span>
    </div>
  );
}

function Chips<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="chips" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => <button type="button" key={v} className="chip" role="radio" aria-checked={value === v} aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

export function EventWizard({ country, plan }: { country: string; plan: OnboardingData['plan'] }) {
  const router = useRouter();
  const [step, setStep] = useState(3);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [pending, start] = useTransition();
  const [logo, setLogo] = useState<{ file: File; url: string } | null>(null);
  const [d, setD] = useState<OnboardingData>({
    type: 'conference', name: '', start: '', end: '', venue: '', timezone: TZ_FOR_COUNTRY[country] ?? 'Asia/Dubai', currency: CURRENCY_FOR_COUNTRY[country] ?? 'AED',
    paid: 'paid', tickets: suggestedTickets('conference'), accredited: 'yes', provider: ACCREDITORS[0][0], activity: '', rule: 'duration',
    gates: 3, passOut: true, recordings: true, photos: true, survey: true, minSessions: 1, evaluationFirst: false, fields: {}, colour: '#0B5CFF',
    invites: [{ email: '', role: 'CHECKIN' }], plan,
  });
  const [typeChosen, setTypeChosen] = useState(false);
  const set = <K extends keyof OnboardingData>(k: K, v: OnboardingData[K]) => { setD((x) => ({ ...x, [k]: v })); setErrors({}); };
  const TY = eventType(d.type);
  const steps = onboardingSteps(typeChosen ? d.type : undefined, d.paid !== 'free');
  const opts = useMemo(() => fieldOptions(d.type), [d.type]);
  const fieldOn = (k: string) => d.fields[k] ?? opts.find((o) => o.key === k)!.on;

  const chooseType = (k: EventTypeKey) => {
    const t = eventType(k);
    const tickets = suggestedTickets(k);
    setD((x) => ({ ...x, type: k, tickets, paid: tickets.every((t2) => t2.price === 0) ? 'free' : tickets.some((t2) => t2.price === 0) ? 'mixed' : 'paid', fields: {}, colour: TYPES.find((y) => y.key === k)!.colour, gates: t.gates ? 3 : 1 }));
    setTypeChosen(true);
    setErrors({});
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (step === 3 && !typeChosen) e.type = 'Choose the type that fits best.';
    if (step === 4) {
      if (d.name.trim().length < 3) e.name = 'Name your event.';
      if (!d.start) e.start = 'Choose the date.';
      if (!TY.gates && (!d.end || d.end < d.start)) e.end = 'Must be on or after the first day.';
    }
    if (step === 5) d.tickets.forEach((t, i) => { if (!t.name.trim()) e[`t${i}`] = 'Name it or remove it.'; });
    if (step === 8 && !isHexColour(d.colour)) e.colour = 'Enter a colour like #0B5CFF.';
    if (step === 9) d.invites.forEach((v, i) => { if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) e[`i${i}`] = 'Enter a valid email or remove this row.'; });
    setErrors(e);
    return !Object.keys(e).length;
  };

  const next = () => {
    if (!validate()) return;
    if (step < 10) { setStep(step + 1); window.scrollTo(0, 0); return; }
    setServerError('');
    start(async () => {
      const r = await finishOnboarding({ ...d, end: TY.gates ? d.start : d.end });
      if (r.error || !r.slug) { setServerError(r.error ?? 'Something went wrong. Try again.'); if (r.step) setStep(r.step); return; }
      if (logo) {
        const fd = new FormData();
        fd.set('file', logo.file);
        fd.set('kind', 'LOGO');
        await fetch(`/events/${r.slug}/files`, { method: 'POST', body: fd }).catch(() => undefined);
      }
      router.push(`/welcome/${r.slug}`);
    });
  };

  const ink = isHexColour(d.colour) ? textOn(d.colour) : '#FFFFFF';
  const fld = (k: string) => `fld ${errors[k] ? 'bad' : ''}`;
  let body: React.ReactNode = null;

  if (step === 3) body = (
    <>
      <h1>What kind of event is it?</h1>
      <p className="lead">This sets up the right tools and the right words. You can run different types of events from the same account.</p>
      <div className={fld('type')} style={{ margin: 0 }}>
        <div className="plan-pick" role="radiogroup" aria-label="Type of event">
          {TYPES.map((t) => (
            <button type="button" key={t.key} className="typecard" role="radio" aria-checked={typeChosen && d.type === t.key} aria-pressed={typeChosen && d.type === t.key} onClick={() => chooseType(t.key)}>
              <span className="emo" style={{ background: t.colour }}><I d={t.icon} s={20} /></span>
              <span><b>{eventType(t.key).label}</b><small>{t.d}</small></span>
            </button>
          ))}
        </div>
        <span className="err">{errors.type}</span>
      </div>
    </>
  );

  if (step === 4) body = (
    <>
      <h1>Tell us about your {TY.label.toLowerCase()}</h1>
      <p className="lead">You can add more events later.</p>
      <div className={fld('name')}>
        <label htmlFor="o-ev">Event name</label>
        <input id="o-ev" className="inp" value={d.name} onChange={(e) => set('name', e.target.value)} placeholder={PLACEHOLDER[d.type][0]} autoFocus maxLength={120} />
        <span className="err">{errors.name}</span>
      </div>
      <div className="row2">
        <div className={fld('start')}>
          <label htmlFor="o-start">{TY.gates ? 'Date' : 'First day'}</label>
          <input id="o-start" className="inp" type="date" value={d.start} onChange={(e) => set('start', e.target.value)} />
          <span className="err">{errors.start}</span>
        </div>
        {!TY.gates && (
          <div className={fld('end')}>
            <label htmlFor="o-end">Last day</label>
            <input id="o-end" className="inp" type="date" value={d.end} min={d.start} onChange={(e) => set('end', e.target.value)} />
            <span className="err">{errors.end}</span>
          </div>
        )}
      </div>
      <div className="fld">
        <label htmlFor="o-venue">Venue<span className="opt">(optional)</span></label>
        <input id="o-venue" className="inp" value={d.venue} onChange={(e) => set('venue', e.target.value)} placeholder={PLACEHOLDER[d.type][1]} maxLength={160} />
      </div>
      <div className="row2">
        <div className="fld">
          <label htmlFor="o-tz">Timezone</label>
          <select id="o-tz" className="inp" value={d.timezone} onChange={(e) => set('timezone', e.target.value)}>{ZONES.map(([z, l]) => <option key={z} value={z}>{l}</option>)}</select>
        </div>
        <div className="fld">
          <label htmlFor="o-cur">Currency</label>
          <select id="o-cur" className="inp" value={d.currency} onChange={(e) => set('currency', e.target.value)}>{['AED', 'KWD', 'SAR', 'QAR', 'BHD', 'OMR'].map((c) => <option key={c}>{c}</option>)}</select>
        </div>
      </div>
    </>
  );

  if (step === 5) body = (
    <>
      <h1>{d.paid === 'free' ? 'Registration' : 'Tickets'}</h1>
      <p className="lead">We’ve suggested ticket types for {TY.label.toLowerCase().startsWith('a') ? 'an' : 'a'} {TY.label.toLowerCase()}. Rename them, change prices or add more.</p>
      <div className="fld"><span className="lbl">Is it free or paid?</span><Chips label="Free or paid" value={d.paid} options={[['free', 'Free registration'], ['paid', 'Paid tickets'], ['mixed', 'Both']]} onChange={(v) => set('paid', v)} /></div>
      <div className="fld" style={{ marginBottom: 6 }}><span className="lbl">{d.paid === 'free' ? 'Registration types' : 'Ticket types'}</span></div>
      {d.tickets.map((t, i) => (
        <div className="tkrow" key={i}>
          <div className={fld(`t${i}`)} style={{ margin: 0 }}>
            <label className="sr" htmlFor={`tk${i}`}>Name</label>
            <input id={`tk${i}`} className="inp" value={t.name} placeholder="Ticket name" maxLength={80} onChange={(e) => set('tickets', d.tickets.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <span className="err">{errors[`t${i}`]}</span>
          </div>
          <div className="fld" style={{ margin: 0 }}>
            <label className="sr" htmlFor={`tp${i}`}>Price in {d.currency}</label>
            <input id={`tp${i}`} className="inp" type="number" min={0} value={d.paid === 'free' ? 0 : t.price} disabled={d.paid === 'free'} onChange={(e) => set('tickets', d.tickets.map((x, j) => (j === i ? { ...x, price: Math.max(0, Number(e.target.value) || 0) } : x)))} />
          </div>
          <button type="button" className="iconbtn" aria-label={`Remove ${t.name || 'ticket'}`} disabled={d.tickets.length < 2} onClick={() => set('tickets', d.tickets.filter((_, j) => j !== i))}><I d={X} /></button>
        </div>
      ))}
      <button type="button" className="btn ghost sm" onClick={() => set('tickets', [...d.tickets, { name: '', price: 0 }])} disabled={d.tickets.length >= 12}>+ Add {d.paid === 'free' ? 'type' : 'ticket type'}</button>
      <p className="hintnote">Prices in {d.currency}. {d.paid === 'free' ? 'Free registration has no per-attendee fee.' : 'Paid tickets add 2.5% plus a small fixed fee per ticket, capped. Buyers pay by card on a secure page and we pay you out weekly, less card processing at cost.'}</p>
    </>
  );

  if (step === 6) {
    if (TY.credits) body = (
      <>
        <h1>CME and certificates</h1>
        <p className="lead">Because this is a medical event, we’ll calculate CME points and put them on each certificate. Everything can be changed later.</p>
        <div className="fld"><span className="lbl">Is the event accredited for CME/CPD?</span><Chips label="Accredited" value={d.accredited!} options={[['yes', 'Yes'], ['pending', 'Applied, waiting'], ['no', 'No, attendance certificate only']]} onChange={(v) => set('accredited', v)} /></div>
        {d.accredited !== 'no' ? (
          <>
            <div className="fld">
              <label htmlFor="o-prov">Accrediting body</label>
              <select id="o-prov" className="inp" value={d.provider} onChange={(e) => set('provider', e.target.value)}>{ACCREDITORS.map(([v, l]) => <option key={l} value={v}>{l}</option>)}</select>
            </div>
            <div className="fld"><label htmlFor="o-act">Activity number<span className="opt">(optional)</span></label><input id="o-act" className="inp" value={d.activity} maxLength={60} onChange={(e) => set('activity', e.target.value)} /><span className="help">From your accreditation letter. You can add it later.</span></div>
            <div className="fld">
              <span className="lbl">Award points for</span>
              <div className="plan-pick" role="radiogroup" aria-label="Award points for" style={{ marginTop: 4 }}>
                {([['duration', 'Time in the room', 'Delegates scan in and out. Points if they stay at least 75% of a session.'], ['checkin', 'Checking in', 'Full points for each session as soon as they scan in.']] as const).map(([v, n, s]) => (
                  <button type="button" key={v} role="radio" aria-checked={d.rule === v} aria-pressed={d.rule === v} onClick={() => set('rule', v)}><span className="r" /><span><b>{n}</b><small>{s}</small></span></button>
                ))}
              </div>
            </div>
            <div className="check"><Toggle on={!!d.evaluationFirst} onChange={(v) => set('evaluationFirst', v)} title="Evaluation before the certificate" sub="Delegates fill in the KIMS-style evaluation first." /></div>
          </>
        ) : <p className="hintnote">Delegates who check in will get a certificate of attendance without CME points.</p>}
      </>
    );
    else if (TY.gates) body = (
      <>
        <h1>Gates and the after-show page</h1>
        <p className="lead">How people get in on the night, and what they see once it’s over.</p>
        <div className="fld">
          <label htmlFor="o-gates">How many entrances?</label>
          <select id="o-gates" className="inp" value={d.gates} onChange={(e) => set('gates', Number(e.target.value))}>{[[1, '1 entrance'], [2, '2 gates'], [3, '3 gates'], [4, '4 gates']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <span className="help">Each gate gets its own check-in screen.{d.gates === d.tickets.length ? ' We’ll match gates to your ticket tiers.' : ''}</span>
        </div>
        <div className="check" style={{ marginTop: 6 }}>
          <Toggle on={!!d.passOut} onChange={(v) => set('passOut', v)} title="Allow pass-outs" sub="Guests can scan out and back in with the same e-ticket." />
          <Toggle on={!!d.photos} onChange={(v) => set('photos', v)} title="Show photos after the show" sub="The homepage becomes a gallery once you switch it on." />
          <Toggle on={!!d.survey} onChange={(v) => set('survey', v)} title="Ask for feedback" sub="A short survey on the after-show page." />
        </div>
      </>
    );
    else if (TY.cert === 'none') body = (
      <>
        <h1>After the event</h1>
        <p className="lead">What {TY.guests} get once it’s over. Only people who checked in can open it with their {TY.idName.charAt(0).toLowerCase() + TY.idName.slice(1)}.</p>
        <div className="check" style={{ marginTop: 0 }}>
          <Toggle on={!!d.recordings} onChange={(v) => set('recordings', v)} title="Session recordings and slides" sub="Link your video host and upload slides after the event." />
          <Toggle on={!!d.photos} onChange={(v) => set('photos', v)} title="Photo gallery" sub="Official photos from each day." />
          <Toggle on={!!d.survey} onChange={(v) => set('survey', v)} title="Feedback survey" sub="A few questions, and a report you can export." />
        </div>
      </>
    );
    else body = (
      <>
        <h1>{d.type === 'workshop' ? 'Certificates of completion' : 'Certificates of attendance'}</h1>
        <p className="lead">People who came can download a certificate with their name and the sessions they attended.{d.type === 'conference' ? ' If you need CME points, choose Medical conference instead.' : ''}</p>
        <div className="fld">
          <label htmlFor="o-min">Who can claim one?</label>
          <select id="o-min" className="inp" value={d.minSessions} onChange={(e) => set('minSessions', Number(e.target.value))}>{[1, 2, 3].map((n) => <option key={n} value={n}>At least {n} {n === 1 ? 'session' : 'sessions'}</option>)}</select>
        </div>
        <div className="check" style={{ marginTop: 0 }}><Toggle on={!!d.evaluationFirst} onChange={(v) => set('evaluationFirst', v)} title="Ask for feedback first" sub="A short survey before the download." /></div>
      </>
    );
  }

  if (step === 7) body = (
    <>
      <h1>What should people fill in?</h1>
      <p className="lead">First name, last name and email are always included. They’re needed for {TY.badge}s, emails and {TY.gates ? 'entry' : 'certificates'}.</p>
      <div className="check" style={{ marginTop: 0 }}>
        {['First name', 'Last name', 'Email'].map((x) => <div key={x}><span className="ck y"><I d={CHECK} s={14} /></span>{x}<small>Always included</small></div>)}
        {opts.map((o) => <Toggle key={o.key} on={fieldOn(o.key)} onChange={(v) => set('fields', { ...d.fields, [o.key]: v })} title={o.label} />)}
      </div>
      <p className="hintnote">Suggested for {TY.label.toLowerCase().startsWith('a') ? 'an' : 'a'} {TY.label.toLowerCase()}. Add your own fields later in Website → {d.paid === 'free' ? 'Registration form' : 'Checkout form'}.</p>
    </>
  );

  if (step === 8) {
    const name = d.name || 'Your event';
    const nav = TY.gates ? 'Line-up · Set times · Venue' : TY.credits ? 'Faculty · Sessions · Venue' : `${TY.people} · Agenda · Venue`;
    body = (
      <>
        <h1>Make it look like your event</h1>
        <p className="lead">Upload your logo and pick your event colour.</p>
        <div className="fld">
          <span className="lbl">Logo<span className="opt">(optional)</span></span>
          <div className="upload">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <div className="lg">{logo ? <img src={logo.url} alt="Your logo" /> : 'No logo yet'}</div>
            <div><b style={{ fontSize: 14 }}>{logo ? 'Replace logo' : 'Upload your logo'}</b><div style={{ fontSize: 12.5, color: 'var(--muted)' }}>PNG, JPG or WebP, up to 5 MB</div></div>
            <input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Upload logo" onChange={(e) => { const f = e.target.files?.[0]; if (f) setLogo({ file: f, url: URL.createObjectURL(f) }); }} />
          </div>
        </div>
        <div className={fld('colour')}>
          <span className="lbl">Event colour</span>
          <div className="colorrow">
            <label className="sw" style={{ background: isHexColour(d.colour) ? d.colour : '#fff' }}><input type="color" value={isHexColour(d.colour) ? d.colour.toLowerCase() : '#000000'} onChange={(e) => set('colour', e.target.value.toUpperCase())} aria-label="Pick event colour" /></label>
            <input className="inp" value={d.colour} maxLength={7} style={{ width: 140, textTransform: 'uppercase' }} aria-label="Hex value" onChange={(e) => set('colour', e.target.value)} />
            {['#B3122E', '#C2410C', '#0E5E4E', '#6D28D9', '#F2B233'].map((c) => <button type="button" key={c} onClick={() => set('colour', c)} style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid var(--surface)', boxShadow: '0 0 0 1px var(--line-2)', background: c }} aria-label={`Use ${c}`} />)}
          </div>
          <span className="err">{errors.colour}</span>
          {isHexColour(d.colour) && (
            <p className="hintnote">{ink === '#FFFFFF' ? `Buttons will use white text (${contrastRatio(d.colour, '#FFFFFF').toFixed(1)}:1 contrast).` : `This colour is light, so button text will be dark (${contrastRatio(d.colour, ink).toFixed(1)}:1) to stay readable.`}</p>
          )}
        </div>
        <div className="mini" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <div className="n" style={{ background: '#fff', color: isHexColour(d.colour) ? d.colour : undefined, borderBottom: '1px solid var(--line)' }}>{logo ? <img src={logo.url} alt="" style={{ height: 18 }} /> : name}<span style={{ color: 'var(--muted)', fontWeight: 500 }}>{nav}</span></div>
          <div className="h" style={{ background: '#101631', color: '#fff', display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
            <span><b style={{ fontSize: 16 }}>{name}</b><br /><span style={{ opacity: 0.7 }}>{d.venue || 'Your venue'}</span></span>
            <span className="b" style={{ background: d.colour, color: ink, padding: '8px 14px', borderRadius: 6, fontWeight: 700 }}>{d.paid === 'free' ? 'Register now' : 'Get tickets'}</span>
          </div>
        </div>
      </>
    );
  }

  if (step === 9) body = (
    <>
      <h1>Invite your team</h1>
      <p className="lead">Check-in staff can only scan {TY.gates ? 'tickets at the gates' : 'badges and print IDs'}. Add them now or later.</p>
      <div className="invites">
        {d.invites.map((v, i) => (
          <div className="inv" key={i}>
            <div className={fld(`i${i}`)} style={{ margin: 0 }}>
              <label className="sr" htmlFor={`inv${i}`}>Email {i + 1}</label>
              <input id={`inv${i}`} className="inp" type="email" value={v.email} placeholder="colleague@organisation.com" onChange={(e) => set('invites', d.invites.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
              <span className="err">{errors[`i${i}`]}</span>
            </div>
            <select className="inp" aria-label={`Role ${i + 1}`} value={v.role} onChange={(e) => set('invites', d.invites.map((x, j) => (j === i ? { ...x, role: e.target.value as 'ADMIN' | 'EDITOR' | 'CHECKIN' } : x)))}>
              <option value="ADMIN">Admin</option><option value="EDITOR">Content editor</option><option value="CHECKIN">Check-in staff</option>
            </select>
            <button type="button" className="iconbtn" aria-label="Remove row" disabled={d.invites.length < 2} onClick={() => set('invites', d.invites.filter((_, j) => j !== i))}><I d={X} /></button>
          </div>
        ))}
      </div>
      <button type="button" className="btn ghost sm" onClick={() => set('invites', [...d.invites, { email: '', role: 'CHECKIN' }])} disabled={d.invites.length >= 20}>+ Add another</button>
    </>
  );

  if (step === 10) body = (
    <>
      <h1>Choose how to pay after the trial</h1>
      <p className="lead">Nothing is charged today. Your first 50 attendees are free; after that we’ll send an invoice for the plan you choose.</p>
      {serverError && <div className="notice err" role="alert">{serverError}</div>}
      <div className="plan-pick" role="radiogroup" aria-label="Plan">
        {PLANS.map(([k, n, s, p]) => (
          <button type="button" key={k} role="radio" aria-checked={d.plan === k} aria-pressed={d.plan === k} onClick={() => set('plan', k)}><span className="r" /><span><b>{n}</b><small>{s}</small></span><span className="pr">{p}</span></button>
        ))}
      </div>
    </>
  );

  return (
    <OnboardingShell steps={steps} current={step} signIn={false}>
      <form onSubmit={(e) => { e.preventDefault(); next(); }} noValidate>
        {serverError && step !== 10 && <div className="notice err" role="alert">{serverError}</div>}
        {body}
        <div className="ob-nav">
          {step > 3 ? <button type="button" className="btn ghost" onClick={() => { setStep(step - 1); setErrors({}); }}><I d={BACK} /> Back</button> : <Link href="/events" className="btn ghost">Skip, go to the dashboard</Link>}
          <span className="sp" />
          {step === 9 && <button type="button" className="btn ghost" onClick={() => { set('invites', [{ email: '', role: 'CHECKIN' }]); setStep(10); }}>Skip for now</button>}
          <button className="btn primary" disabled={pending}>{pending ? 'Setting up…' : step === 10 ? 'Finish setup' : 'Continue'} <I d={ARROW} /></button>
        </div>
      </form>
    </OnboardingShell>
  );
}
