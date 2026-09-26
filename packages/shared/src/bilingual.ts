import type { Locale } from './time';

/**
 * Organiser text in two languages. Each translatable row keeps its English in
 * the usual columns and Arabic versions in `ar`, keyed by field name. On an
 * Arabic page the Arabic is used where it exists; anything left empty falls
 * back to the English, so a half-translated site still reads.
 */
export type ArabicText = Record<string, string | string[]>;

export function arabicOf(row: { ar?: unknown }): ArabicText {
  return row.ar && typeof row.ar === 'object' && !Array.isArray(row.ar) ? (row.ar as ArabicText) : {};
}

export function localise<T extends { ar?: unknown }>(row: T, locale: Locale): T {
  if (locale !== 'ar') return row;
  const ar = arabicOf(row);
  const out: Record<string, unknown> = { ...row };
  for (const [k, v] of Object.entries(ar)) {
    if (k === 'options') continue; // option labels only; the English stays the value (see optionLabels)
    if (typeof v === 'string' && v.trim()) out[k] = v;
  }
  return out as T;
}

export const localiseAll = <T extends { ar?: unknown }>(rows: T[], locale: Locale) => rows.map((r) => localise(r, locale));

/** Labels to show for a dropdown's options; the submitted values stay the English ones. */
export function optionLabels(field: { options: string[]; ar?: unknown }, locale: Locale): string[] {
  const ar = arabicOf(field).options;
  if (locale !== 'ar' || !Array.isArray(ar)) return field.options;
  return field.options.map((o, i) => (typeof ar[i] === 'string' && ar[i].trim() ? ar[i] : o));
}

/** Reads `ar_<field>` inputs from a form into an `ar` object. */
export function arabicFromForm(fd: { get(name: string): unknown }, fields: string[], max = 20_000): ArabicText {
  const out: ArabicText = {};
  for (const f of fields) {
    const v = String(fd.get(`ar_${f}`) ?? '').trim().slice(0, max);
    if (v) out[f] = v;
  }
  return out;
}

/**
 * Applies `ar_<field>` inputs to an existing `ar` object. Only fields the form
 * actually had are touched (an empty one clears that translation), so a form
 * shown without Arabic inputs never wipes what's saved.
 */
export function mergeArabic(existing: unknown, fd: { get(name: string): unknown }, fields: string[], max = 20_000): ArabicText {
  const out: ArabicText = { ...arabicOf({ ar: existing }) };
  for (const f of fields) {
    const raw = fd.get(`ar_${f}`);
    if (raw === null || raw === undefined) continue;
    const v = String(raw).trim().slice(0, max);
    if (v) out[f] = v;
    else delete out[f];
  }
  return out;
}
