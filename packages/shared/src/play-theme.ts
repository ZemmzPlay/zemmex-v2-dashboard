import { contrastRatio, fixContrast, textOn } from './contrast';

/**
 * A tournament website's look: typefaces, and colours per section with the
 * same contrast rules as everywhere else (docs/prototype play-dashboard,
 * Website → Theme and "Advanced colour options").
 */

export interface PlayFont { key: string; name: string; weights: string }
/** 18 English typefaces, as in the prototype. `weights` is the Google Fonts axis to load. */
export const PLAY_FONTS_EN: PlayFont[] = [
  { key: 'sora', name: 'Sora', weights: '400;600;700;800' },
  { key: 'inter', name: 'Inter', weights: '400;600;700;800' },
  { key: 'manrope', name: 'Manrope', weights: '400;600;700;800' },
  { key: 'poppins', name: 'Poppins', weights: '400;600;700;800' },
  { key: 'montserrat', name: 'Montserrat', weights: '400;600;700;800' },
  { key: 'space-grotesk', name: 'Space Grotesk', weights: '400;600;700' },
  { key: 'outfit', name: 'Outfit', weights: '400;600;700;800' },
  { key: 'dm-sans', name: 'DM Sans', weights: '400;600;700;800' },
  { key: 'rubik', name: 'Rubik', weights: '400;600;700;800' },
  { key: 'barlow', name: 'Barlow', weights: '400;600;700;800' },
  { key: 'chakra-petch', name: 'Chakra Petch', weights: '400;600;700' },
  { key: 'exo-2', name: 'Exo 2', weights: '400;600;700;800' },
  { key: 'orbitron', name: 'Orbitron', weights: '400;600;700;800' },
  { key: 'oswald', name: 'Oswald', weights: '400;600;700' },
  { key: 'teko', name: 'Teko', weights: '400;600;700' },
  { key: 'bebas-neue', name: 'Bebas Neue', weights: '' },
  { key: 'russo-one', name: 'Russo One', weights: '' },
  { key: 'audiowide', name: 'Audiowide', weights: '' },
];
/** 11 Arabic typefaces. */
export const PLAY_FONTS_AR: PlayFont[] = [
  { key: 'plex', name: 'IBM Plex Sans Arabic', weights: '400;600;700' },
  { key: 'cairo', name: 'Cairo', weights: '400;600;700;800' },
  { key: 'tajawal', name: 'Tajawal', weights: '400;500;700;800' },
  { key: 'almarai', name: 'Almarai', weights: '400;700;800' },
  { key: 'noto-kufi', name: 'Noto Kufi Arabic', weights: '400;600;700;800' },
  { key: 'readex', name: 'Readex Pro', weights: '400;600;700' },
  { key: 'changa', name: 'Changa', weights: '400;600;700;800' },
  { key: 'el-messiri', name: 'El Messiri', weights: '400;600;700' },
  { key: 'reem-kufi', name: 'Reem Kufi', weights: '400;600;700' },
  { key: 'lalezar', name: 'Lalezar', weights: '' },
  { key: 'rubik-ar', name: 'Rubik', weights: '400;600;700;800' },
];
export const playFont = (key: string, ar = false) => (ar ? PLAY_FONTS_AR : PLAY_FONTS_EN).find((f) => f.key === key) ?? (ar ? PLAY_FONTS_AR : PLAY_FONTS_EN)[0];

/** The Google Fonts stylesheet for some typefaces. */
export function googleFontsUrl(fonts: PlayFont[]) {
  const families = [...new Map(fonts.map((f) => [f.name, f])).values()].map((f) => `family=${f.name.replace(/ /g, '+')}${f.weights ? `:wght@${f.weights}` : ''}`);
  return `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`;
}

/* ------------------------------------------------------------------ */
/* Section colours                                                      */
/* ------------------------------------------------------------------ */

export type ThemeSection = 'nav' | 'tsec' | 'card' | 'sp' | 'foot';
export type PlayTheme = Record<ThemeSection, Record<string, string>>;

/** Each section, its colours, and which colours are text that must read on its background. */
export const THEME_SECTIONS: { key: ThemeSection; label: string; fields: [string, string][]; text: string[] }[] = [
  { key: 'nav', label: 'Navigation bar', fields: [['bg', 'Background colour'], ['text', 'Text colour'], ['hi', 'Highlighted text colour']], text: ['text', 'hi'] },
  { key: 'tsec', label: 'Tournament section', fields: [['bg', 'Background colour'], ['title', 'Section title colour'], ['hi', 'Highlighted text colour']], text: ['title', 'hi'] },
  { key: 'card', label: 'Tournament cards', fields: [['bg', 'Background colour'], ['text', 'Text colour']], text: ['text'] },
  { key: 'sp', label: 'Sponsor section', fields: [['bg', 'Background colour'], ['title', 'Section title colour']], text: ['title'] },
  { key: 'foot', label: 'Footer', fields: [['bg', 'Background colour'], ['title', 'Text colour'], ['hi', 'Highlighted text colour']], text: ['title', 'hi'] },
];

const HEX = /^#[0-9A-Fa-f]{6}$/;

/** The colours the website uses when the organiser hasn't chosen: the prototype's defaults, with the brand colour for highlights. */
export function defaultTheme(brand: string): PlayTheme {
  const nav = '#07052E', light = '#F4F5FA';
  return {
    nav: { bg: nav, text: '#FFFFFF', hi: contrastRatio(brand, nav) >= 4.5 ? brand : fixContrast(brand, nav) },
    tsec: { bg: light, title: '#0D0B2E', hi: fixContrast(brand, light) },
    card: { bg: '#FFFFFF', text: '#0D0B2E' },
    sp: { bg: '#FFFFFF', title: '#0D0B2E' },
    foot: { bg: nav, title: '#B7B6D6', hi: '#FFFFFF' },
  };
}

/** What the organiser saved, checked: only valid colours for known fields. */
export function storedTheme(raw: unknown): Partial<PlayTheme> {
  const out: Partial<PlayTheme> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const s of THEME_SECTIONS) {
    const v = (raw as Record<string, unknown>)[s.key];
    if (!v || typeof v !== 'object') continue;
    const row: Record<string, string> = {};
    for (const [f] of s.fields) {
      const c = (v as Record<string, unknown>)[f];
      if (typeof c === 'string' && HEX.test(c)) row[f] = c.toUpperCase();
    }
    if (Object.keys(row).length) out[s.key] = row;
  }
  return out;
}

export function resolveTheme(brand: string, raw: unknown): PlayTheme {
  const d = defaultTheme(brand);
  const s = storedTheme(raw);
  return Object.fromEntries(THEME_SECTIONS.map((x) => [x.key, { ...d[x.key], ...(s[x.key] ?? {}) }])) as PlayTheme;
}

/** Highlights are large or bold, so 3:1 is enough; body and title text need 4.5:1. */
const needs = (field: string) => (field === 'hi' ? 3 : 4.5);

export interface ThemeIssue { section: ThemeSection; field: string; ratio: number; needs: number }
export function themeIssues(t: PlayTheme): ThemeIssue[] {
  const out: ThemeIssue[] = [];
  for (const s of THEME_SECTIONS) {
    for (const f of s.text) {
      const ratio = contrastRatio(t[s.key][f], t[s.key].bg);
      if (ratio < needs(f)) out.push({ section: s.key, field: f, ratio, needs: needs(f) });
    }
  }
  return out;
}

/** "Fix all contrast": text switches to white or dark where that reads; highlights keep their hue and are lightened or darkened. */
export function fixTheme(t: PlayTheme): PlayTheme {
  const out = JSON.parse(JSON.stringify(t)) as PlayTheme;
  for (const i of themeIssues(t)) {
    const bg = out[i.section].bg;
    out[i.section][i.field] = i.field === 'hi' ? fixContrast(out[i.section][i.field], bg, 4.5) : textOn(bg);
  }
  return out;
}

/** CSS variables for the sections the organiser changed; the rest keep the stylesheet's light and dark defaults. */
export function themeVars(brand: string, raw: unknown): Record<string, string> {
  const s = storedTheme(raw);
  const t = resolveTheme(brand, raw);
  const vars: Record<string, string> = {};
  const map: Record<ThemeSection, [string, string][]> = {
    nav: [['bg', '--nav-bg'], ['text', '--nav-ink'], ['hi', '--nav-hi']],
    tsec: [['bg', '--tsec-bg'], ['title', '--tsec-title'], ['hi', '--tsec-hi']],
    card: [['bg', '--card-bg'], ['text', '--card-text']],
    sp: [['bg', '--sp-bg'], ['title', '--sp-title']],
    foot: [['bg', '--foot-bg'], ['title', '--foot-ink'], ['hi', '--foot-hi']],
  };
  for (const sec of THEME_SECTIONS) {
    if (!s[sec.key]) continue;
    for (const [f, v] of map[sec.key]) vars[v] = t[sec.key][f];
  }
  return vars;
}
