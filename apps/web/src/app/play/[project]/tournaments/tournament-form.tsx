'use client';

import { useActionState, useState } from 'react';
import { FORMAT_LABEL, PLAY_COUNTRIES, PLAY_GAMES, type Format } from '@zemmz/shared';
import type { ActionState } from '@/lib/action-state';
import { keepValues } from '@/lib/use-keep-values';

export interface TournamentValues {
  name: string; nameAr: string; game: string; format: Format; teamSize: number; capacity: number; platform: string;
  timezone: string; regOpensDate: string; regOpensTime: string; regClosesDate: string; regClosesTime: string;
  startsDate: string; startsTime: string; endsDate: string; endsTime: string; bestOf: number;
  countries: string[]; playersReport: boolean; verifiedOnly: boolean; checkIn: boolean;
  currency: string; entryFee: string; prizes: { place: number; amount: string; label: string }[];
  description: string; descriptionAr: string;
}

const STEPS: [string, string][] = [['Game', 'Game, name and format'], ['Schedule', 'Dates, times and timezone'], ['Rules', 'Who can play and how'], ['Prizes', 'Entry fee, prizes and description']];
const TZS: [string, string][] = [['Asia/Dubai', 'Gulf Standard Time (Dubai, Muscat)'], ['Asia/Riyadh', 'Arabia Standard Time (Riyadh, Kuwait, Doha)'], ['Asia/Kuwait', 'Kuwait'], ['Africa/Cairo', 'Egypt (Cairo)'], ['Asia/Amman', 'Jordan (Amman)'], ['Europe/Istanbul', 'Türkiye (Istanbul)'], ['UTC', 'UTC']];
const PRESETS: [string, string][] = [['GCC', 'GCC'], ['ME', 'Middle East'], ['ARAB', 'Arab world'], ['ALL', 'Anywhere']];

/**
 * The prototype's four steps as one form: earlier steps are hidden, not
 * unmounted, so everything is posted together and nothing typed is lost.
 */
export function TournamentForm({ action, initial, editing, started, bilingual }: {
  action: (p: ActionState, fd: FormData) => Promise<ActionState>;
  initial: TournamentValues;
  editing: boolean;
  /** Once the bracket exists only names, description, prizes and the end date change. */
  started: boolean;
  bilingual: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [step, setStep] = useState(0);
  const [v, setV] = useState(initial);
  const set = <K extends keyof TournamentValues>(k: K, val: TournamentValues[K]) => setV((x) => ({ ...x, [k]: val }));
  const last = step === STEPS.length - 1;
  const locked = started;

  return (
    <form action={formAction} onSubmit={keepValues(formAction)} noValidate className="wiz">
      <nav className="steps" aria-label="Steps">
        {STEPS.map(([n, s], i) => (
          <button type="button" key={n} className={`step ${i === step ? 'cur' : ''} ${i < step ? 'done' : ''}`} aria-current={i === step ? 'step' : undefined} onClick={() => setStep(i)}>
            <span className="num">{i + 1}</span><span><b>{n}</b><small>{s}</small></span>
          </button>
        ))}
      </nav>
      <div>
        {state.error && <div className="notice err mb-4" role="alert">{state.error}</div>}
        {locked && <div className="notice info mb-4">This tournament has started, so the format, dates and rules are fixed. You can still change its name, description, prizes and end date.</div>}

        <fieldset hidden={step !== 0} className="m-0 border-0 p-0" disabled={locked}>
          <section className="fsec">
            <h2>Game</h2>
            <input type="hidden" name="game" value={v.game} />
            <div className="opt-cards">
              {PLAY_GAMES.map((g) => (
                <button type="button" key={g.key} className="opt-card" aria-pressed={v.game === g.key} onClick={() => { set('game', g.key); if (!v.platform) set('platform', g.platform); if (!editing) set('teamSize', g.solo ? 1 : v.teamSize > 1 ? v.teamSize : 5); }}>
                  <span className="mb-1 block h-9 rounded-lg" style={{ background: `linear-gradient(135deg,${g.c1},${g.c2})` }} />
                  <b>{g.name}</b>
                </button>
              ))}
            </div>
          </section>
          <section className="fsec">
            <h2>Name</h2>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <div className="fld"><label htmlFor="t-name">English<span className="req">*</span></label><input id="t-name" name="name" className="inp" value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="For example, Valorant Open — Season 3" maxLength={100} disabled={false} /></div>
              {bilingual && <div className="fld"><label htmlFor="t-name-ar">Arabic<span className="opt">optional</span></label><input id="t-name-ar" name="ar_name" dir="rtl" lang="ar" className="inp" value={v.nameAr} onChange={(e) => set('nameAr', e.target.value)} maxLength={100} /><span className="help">If empty, the English name is used.</span></div>}
            </div>
          </section>
          <section className="fsec">
            <h2>Format</h2>
            <input type="hidden" name="format" value={v.format} />
            <div className="opt-cards">
              {(Object.keys(FORMAT_LABEL) as Format[]).map((f) => (
                <button type="button" key={f} className="opt-card" aria-pressed={v.format === f} onClick={() => set('format', f)}><b>{FORMAT_LABEL[f].en}</b><small>{FORMAT_LABEL[f].note}</small></button>
              ))}
            </div>
            <div className="mt-4 grid gap-x-4 sm:grid-cols-3">
              <div className="fld"><label htmlFor="t-team">Players per entry</label><input id="t-team" name="teamSize" type="number" min={1} max={12} className="inp" value={v.teamSize} onChange={(e) => set('teamSize', Number(e.target.value))} /><span className="help">1 for solo. More: a captain registers a team and shares a code.</span></div>
              <div className="fld"><label htmlFor="t-cap">Maximum {v.teamSize > 1 ? 'teams' : 'players'}</label><input id="t-cap" name="capacity" type="number" min={2} className="inp" value={v.capacity} onChange={(e) => set('capacity', Number(e.target.value))} /></div>
              <div className="fld"><label htmlFor="t-plat">Platform</label><input id="t-plat" name="platform" className="inp" value={v.platform} onChange={(e) => set('platform', e.target.value)} maxLength={60} placeholder="PlayStation" /></div>
            </div>
          </section>
        </fieldset>

        <fieldset hidden={step !== 1} className="m-0 border-0 p-0">
          <section className="fsec">
            <h2>Timezone</h2>
            <p className="hint">All dates and times are in this timezone. Players see them in their own.</p>
            <select name="timezone" className="sel max-w-[420px]" value={v.timezone} onChange={(e) => set('timezone', e.target.value)} disabled={locked} aria-label="Timezone">
              {TZS.map(([z, l]) => <option key={z} value={z}>{l}</option>)}
            </select>
          </section>
          <section className="fsec">
            <h2>Dates and times</h2>
            <p className="hint">Registration closes before the tournament starts.</p>
            {([['regOpens', 'Registration opens'], ['regCloses', 'Registration closes'], ['starts', 'Tournament starts'], ['ends', 'Tournament ends']] as const).map(([k, l]) => (
              <div className="grid gap-x-4 sm:grid-cols-2" key={k}>
                <div className="fld"><label htmlFor={`t-${k}`}>{l}</label><input id={`t-${k}`} type="date" name={`${k}Date`} className="inp" value={v[`${k}Date`]} onChange={(e) => set(`${k}Date`, e.target.value)} disabled={locked && k !== 'ends'} /></div>
                <div className="fld"><label htmlFor={`t-${k}t`}>Time</label><input id={`t-${k}t`} type="time" name={`${k}Time`} className="inp" value={v[`${k}Time`]} onChange={(e) => set(`${k}Time`, e.target.value)} disabled={locked && k !== 'ends'} /></div>
              </div>
            ))}
            {locked && (['regOpens', 'regCloses', 'starts'] as const).flatMap((k) => [<input key={`${k}d`} type="hidden" name={`${k}Date`} value={v[`${k}Date`]} />, <input key={`${k}t`} type="hidden" name={`${k}Time`} value={v[`${k}Time`]} />])}
            {locked && <input type="hidden" name="timezone" value={v.timezone} />}
          </section>
          <section className="fsec">
            <h2>Matches</h2>
            <div className="fld max-w-[240px] !mb-0"><label htmlFor="t-bo">Match format</label><select id="t-bo" name="bestOf" className="sel" value={v.bestOf} onChange={(e) => set('bestOf', Number(e.target.value))} disabled={locked}>{[1, 3, 5, 7].map((n) => <option key={n} value={n}>Best of {n}</option>)}</select></div>
          </section>
        </fieldset>

        <fieldset hidden={step !== 2} className="m-0 border-0 p-0" disabled={locked}>
          <section className="fsec">
            <h2>Who can take part</h2>
            <p className="hint">{v.countries.length ? `${v.countries.length} ${v.countries.length === 1 ? 'country' : 'countries'} selected.` : 'Open to players anywhere.'} Use a preset, then adjust.</p>
            <div className="mb-3 flex flex-wrap gap-2">
              {PRESETS.map(([k, l]) => <button type="button" key={k} className="btn secondary sm" onClick={() => set('countries', k === 'ALL' ? [] : PLAY_COUNTRIES.filter((c) => c.groups.includes(k)).map((c) => c.code))}>{l}</button>)}
            </div>
            <div className="grid gap-1.5 sm:grid-cols-3">
              {PLAY_COUNTRIES.map((c) => (
                <label key={c.code} className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="countries" value={c.code} checked={v.countries.includes(c.code)} onChange={(e) => set('countries', e.target.checked ? [...v.countries, c.code] : v.countries.filter((x) => x !== c.code))} /> {c.flag} {c.name}</label>
              ))}
            </div>
          </section>
          <section className="fsec">
            <h2>Rules</h2>
            <label className="switch mb-2"><input type="checkbox" role="switch" name="playersReport" checked={v.playersReport} onChange={(e) => set('playersReport', e.target.checked)} /> Players report their own results with a screenshot</label>
            <p className="help mb-3 mt-0">Off: only admins enter results.</p>
            <label className="switch mb-2"><input type="checkbox" role="switch" name="verifiedOnly" checked={v.verifiedOnly} onChange={(e) => set('verifiedOnly', e.target.checked)} /> Only verified players can register</label>
            <p className="help mb-3 mt-0">You verify players under Players.</p>
            <label className="switch mb-2"><input type="checkbox" role="switch" name="checkIn" checked={v.checkIn} onChange={(e) => set('checkIn', e.target.checked)} /> Players must check in before the start</label>
            <p className="help m-0">Check-in opens an hour before. Those who don’t check in are left out of the bracket.</p>
          </section>
        </fieldset>

        <fieldset hidden={step !== 3} className="m-0 border-0 p-0">
          <section className="fsec">
            <h2>Entry fee</h2>
            <div className="grid max-w-[420px] gap-x-4 sm:grid-cols-[1fr_120px]">
              <div className="fld"><label htmlFor="t-fee">Per {v.teamSize > 1 ? 'team' : 'player'}</label><input id="t-fee" name="entryFee" type="number" min={0} step="any" className="inp" value={v.entryFee} onChange={(e) => set('entryFee', e.target.value)} disabled={locked} /><span className="help">0 for free. Paid entries add the zemmz fee (2.5% plus a small fixed amount, capped) on top.</span></div>
              <div className="fld"><label htmlFor="t-cur">Currency</label><select id="t-cur" name="currency" className="sel" value={v.currency} onChange={(e) => set('currency', e.target.value)} disabled={locked}>{['AED', 'KWD', 'SAR', 'QAR', 'BHD', 'OMR'].map((c) => <option key={c}>{c}</option>)}</select></div>
            </div>
            {locked && <><input type="hidden" name="entryFee" value={v.entryFee} /><input type="hidden" name="currency" value={v.currency} /></>}
          </section>
          <section className="fsec">
            <h2>Prizes</h2>
            <p className="hint">Paid to the winners after the tournament; you record each payment once it’s made.</p>
            {v.prizes.map((p, i) => (
              <div className="grid items-end gap-x-3 sm:grid-cols-[90px_160px_1fr_auto]" key={i}>
                <div className="fld"><label htmlFor={`pp-${i}`}>Place</label><input id={`pp-${i}`} name="prizePlace" type="number" min={1} className="inp" value={p.place} onChange={(e) => set('prizes', v.prizes.map((x, j) => (j === i ? { ...x, place: Number(e.target.value) } : x)))} /></div>
                <div className="fld"><label htmlFor={`pa-${i}`}>Amount ({v.currency})</label><input id={`pa-${i}`} name="prizeAmount" type="number" min={0} step="any" className="inp" value={p.amount} onChange={(e) => set('prizes', v.prizes.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} /></div>
                <div className="fld"><label htmlFor={`pl-${i}`}>Or a prize<span className="opt">optional</span></label><input id={`pl-${i}`} name="prizeLabel" className="inp" value={p.label} onChange={(e) => set('prizes', v.prizes.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="For example, PS5 and trophy" /></div>
                <button type="button" className="btn ghost sm mb-5" onClick={() => set('prizes', v.prizes.filter((_, j) => j !== i))} aria-label={`Remove prize for place ${p.place}`}>Remove</button>
              </div>
            ))}
            <button type="button" className="btn secondary sm" onClick={() => set('prizes', [...v.prizes, { place: (v.prizes.at(-1)?.place ?? 0) + 1, amount: '', label: '' }])}>Add a prize</button>
          </section>
          <section className="fsec">
            <h2>About this tournament</h2>
            <div className="fld"><label htmlFor="t-desc">Description<span className="opt">optional</span></label><textarea id="t-desc" name="description" className="inp min-h-[110px]" value={v.description} onChange={(e) => set('description', e.target.value)} maxLength={2000} placeholder="Schedule highlights, check-in details, how finals are played…" /></div>
            {bilingual && <div className="fld !mb-0"><label htmlFor="t-desc-ar">Description in Arabic<span className="opt">optional</span></label><textarea id="t-desc-ar" name="ar_description" dir="rtl" lang="ar" className="inp min-h-[110px]" value={v.descriptionAr} onChange={(e) => set('descriptionAr', e.target.value)} maxLength={2000} /></div>}
          </section>
        </fieldset>

        {/* Disabled fieldsets don't post: keep the locked values. */}
        {locked && (
          <>
            <input type="hidden" name="game" value={v.game} /><input type="hidden" name="format" value={v.format} /><input type="hidden" name="teamSize" value={v.teamSize} />
            <input type="hidden" name="capacity" value={v.capacity} /><input type="hidden" name="platform" value={v.platform} /><input type="hidden" name="bestOf" value={v.bestOf} />
          </>
        )}

        <div className="wiz-nav">
          {step > 0 ? <button type="button" className="btn secondary" onClick={() => setStep(step - 1)}>Back</button> : <span />}
          <span className="flex-1" />
          {!last ? (
            <button type="button" className="btn primary" onClick={() => setStep(step + 1)}>Continue to {STEPS[step + 1][0].toLowerCase()}</button>
          ) : editing ? (
            <button className="btn primary" disabled={pending}>{pending ? 'Saving…' : 'Save changes'}</button>
          ) : (
            <>
              <button className="btn secondary" disabled={pending}>Save as draft</button>
              <button className="btn primary" name="publish" value="1" disabled={pending}>{pending ? 'Creating…' : 'Create and publish'}</button>
            </>
          )}
        </div>
      </div>
    </form>
  );
}
