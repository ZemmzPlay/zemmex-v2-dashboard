'use client';

import { useActionState, useMemo, useState } from 'react';
import {
  contrastRatio, defaultTheme, fixContrast, fixTheme, PLAY_FONTS_AR, PLAY_FONTS_EN, playFont, resolveTheme, textOn, THEME_SECTIONS, themeIssues,
  type PlayTheme, type ThemeSection,
} from '@zemmz/shared';
import type { ActionState } from '@/lib/action-state';
import { Icon } from '@/components/icon';

/**
 * Typefaces and the advanced colour options: every text colour is checked
 * against its background as it changes, with Fix per pair and Fix all.
 */
export function ThemeForm({ action, brand, initial, canEdit }: {
  action: (p: ActionState, fd: FormData) => Promise<ActionState>;
  brand: string;
  initial: { fontEn: string; fontAr: string; theme: unknown };
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [fontEn, setFontEn] = useState(initial.fontEn);
  const [fontAr, setFontAr] = useState(initial.fontAr);
  const [t, setT] = useState<PlayTheme>(() => resolveTheme(brand, initial.theme));
  const issues = useMemo(() => themeIssues(t), [t]);
  const defaults = defaultTheme(brand);
  const set = (s: ThemeSection, f: string, v: string) => setT((x) => ({ ...x, [s]: { ...x[s], [f]: v.toUpperCase() } }));
  const fix = (s: ThemeSection, f: string) => set(s, f, f === 'hi' ? fixContrast(t[s][f], t[s].bg, 4.5) : textOn(t[s].bg));
  // Only sections that differ from the defaults are saved, so the rest follow the brand colour and dark mode.
  const changed = Object.fromEntries(THEME_SECTIONS.filter((s) => s.fields.some(([f]) => t[s.key][f] !== defaults[s.key][f])).map((s) => [s.key, t[s.key]]));
  const en = playFont(fontEn), ar = playFont(fontAr, true);
  const hex = /^#[0-9A-F]{6}$/i;

  return (
    <form action={formAction} className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <input type="hidden" name="theme" value={JSON.stringify(changed)} />
      <div className="flex min-w-0 flex-col gap-4">
        {state.error && <div className="notice err" role="alert">{state.error}</div>}
        {state.ok && !pending && <div className="notice ok" role="status">{state.ok}</div>}
        <section className="card card-b" data-tour="fonts">
          <h2 className="m-0 mb-1 text-[15px] font-semibold">Typefaces</h2>
          <p className="m-0 mb-4 text-[13px] text-muted">{PLAY_FONTS_EN.length} English and {PLAY_FONTS_AR.length} Arabic typefaces, each shown in its own style.</p>
          <fieldset disabled={!canEdit} className="m-0 grid gap-4 border-0 p-0 sm:grid-cols-2">
            <div className="fld !mb-0">
              <label htmlFor="f-en">English</label>
              <select id="f-en" name="fontEn" className="sel" value={fontEn} onChange={(e) => setFontEn(e.target.value)} style={{ fontFamily: `'${en.name}'` }}>
                {PLAY_FONTS_EN.map((f) => <option key={f.key} value={f.key} style={{ fontFamily: `'${f.name}'` }}>{f.name}</option>)}
              </select>
            </div>
            <div className="fld !mb-0">
              <label htmlFor="f-ar">Arabic</label>
              <select id="f-ar" name="fontAr" className="sel" value={fontAr} onChange={(e) => setFontAr(e.target.value)} style={{ fontFamily: `'${ar.name}'` }}>
                {PLAY_FONTS_AR.map((f) => <option key={f.key} value={f.key} style={{ fontFamily: `'${f.name}'` }}>{f.name} · عربي</option>)}
              </select>
            </div>
          </fieldset>
        </section>

        <section className="card card-b" data-tour="colours">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h2 className="m-0 flex-1 text-[15px] font-semibold">Colours for each section</h2>
            {canEdit && <button type="button" className="btn ghost sm" onClick={() => setT(defaultTheme(brand))}>Back to defaults</button>}
            {canEdit && <button type="button" className="btn secondary sm" disabled={!issues.length} onClick={() => setT(fixTheme(t))}><Icon name="sparkle" size={15} /> Fix all contrast</button>}
          </div>
          <p className="m-0 mb-3 text-[13px] text-muted">Defaults follow your brand colour. Every text colour is checked against its background: body text needs 4.5:1, highlights 3:1.</p>
          {issues.length > 0 && <div className="notice warn mb-3" role="status"><Icon name="alert" size={16} /><span>{issues.length} {issues.length === 1 ? 'colour pair is' : 'colour pairs are'} hard to read. Fix {issues.length === 1 ? 'it' : 'them'} before saving.</span></div>}
          <fieldset disabled={!canEdit} className="m-0 border-0 p-0">
            {THEME_SECTIONS.map((s) => (
              <div key={s.key} className="border-t border-line py-3 first:border-0">
                <h3 className="m-0 mb-2 text-[13.5px] font-semibold">{s.label}</h3>
                <div className="grid gap-2 sm:grid-cols-3">
                  {s.fields.map(([f, label]) => {
                    const v = t[s.key][f];
                    const isText = s.text.includes(f);
                    const ratio = isText && hex.test(v) ? contrastRatio(v, t[s.key].bg) : null;
                    const need = f === 'hi' ? 3 : 4.5;
                    return (
                      <div key={f} className="flex flex-col gap-1">
                        <label className="text-[12px] text-muted" htmlFor={`c-${s.key}-${f}`}>{label}</label>
                        <div className="flex items-center gap-1.5">
                          <input type="color" aria-label={`${s.label}: ${label}`} value={hex.test(v) ? v : '#000000'} onChange={(e) => set(s.key, f, e.target.value)} className="h-9 w-10 flex-none cursor-pointer rounded-lg border border-line-2 bg-surface p-1" />
                          <input id={`c-${s.key}-${f}`} className="inp !h-9 w-[92px] font-mono text-[12.5px] uppercase" value={v} maxLength={7} onChange={(e) => set(s.key, f, e.target.value)} aria-invalid={!hex.test(v) || undefined} />
                        </div>
                        {ratio != null && (
                          <span className={`text-[12px] ${ratio >= 4.5 ? 'text-ok' : ratio >= need ? 'text-warn' : 'text-danger'}`}>
                            {ratio.toFixed(1)}:1 {ratio >= 4.5 ? 'readable' : ratio >= need ? 'large text only' : 'hard to read'}
                            {ratio < need && canEdit && <> · <button type="button" className="font-semibold underline" onClick={() => fix(s.key, f)}>Fix</button></>}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </fieldset>
        </section>
        {canEdit && <div><button className="btn primary" disabled={pending || issues.length > 0 || Object.values(t).some((r) => Object.values(r).some((c) => !hex.test(c)))}>{pending ? 'Saving…' : 'Save theme'}</button></div>}
      </div>

      <aside className="xl:sticky xl:top-4 xl:self-start" data-tour="preview">
        <div className="mb-2 text-[12px] font-semibold uppercase tracking-[.05em] text-muted">Preview</div>
        <div className="overflow-hidden rounded-2xl border border-line text-[12px]" style={{ fontFamily: `'${en.name}', sans-serif` }} aria-hidden="true">
          <div className="flex items-center gap-3 px-3 py-2.5" style={{ background: t.nav.bg, color: t.nav.text }}>
            <b className="text-[13px]">Your league</b><span style={{ color: t.nav.hi }}>Home</span><span>Tournaments</span><span className="ml-auto rounded-md px-2 py-1 font-semibold" style={{ background: brand, color: textOn(brand) }}>Register</span>
          </div>
          <div className="p-3" style={{ background: t.tsec.bg }}>
            <div className="mb-2 flex items-baseline justify-between"><b className="text-[15px]" style={{ color: t.tsec.title }}>Tournaments</b><span style={{ color: t.tsec.hi }}>See all →</span></div>
            <div className="rounded-xl border border-black/10 p-2.5" style={{ background: t.card.bg, color: t.card.text }}>
              <b className="block">Valorant Open</b><span className="opacity-80">Starts 12 October · AED 5,000</span>
            </div>
          </div>
          <div className="p-3" style={{ background: t.sp.bg }}><b style={{ color: t.sp.title }}>Our partners</b></div>
          <div className="px-3 py-2.5" style={{ background: t.foot.bg, color: t.foot.title }}><span style={{ color: t.foot.hi }}>Explore</span> · Rules · FAQ</div>
          <div dir="rtl" className="px-3 py-2.5 text-[13px]" style={{ fontFamily: `'${ar.name}', sans-serif`, background: t.tsec.bg, color: t.tsec.title }}>البطولات · سجّل الآن</div>
        </div>
      </aside>
    </form>
  );
}
