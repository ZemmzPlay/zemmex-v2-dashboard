/**
 * The Arabic version of an organiser's text, next to the English. Only shown
 * when the event's website is in Arabic or both; posted as `ar_<name>`.
 * Empty means "use the English on the Arabic site too".
 */
export function ArabicInput({ name, label, defaultValue, textarea, rows = 3, maxLength = 2000, className = '', idSuffix = '' }: { name: string; label: string; defaultValue?: string; textarea?: boolean; rows?: number; maxLength?: number; className?: string; /** Keeps ids unique when the same form appears several times. */ idSuffix?: string }) {
  const id = `ar-${name}${idSuffix ? `-${idSuffix}` : ''}`;
  const common = { id, name: `ar_${name}`, dir: 'rtl' as const, lang: 'ar', defaultValue: defaultValue ?? '', maxLength, className: 'inp', style: { fontFamily: 'var(--font-arabic, inherit)' } };
  return (
    <div className={`fld ${className}`}>
      <label htmlFor={id}>{label} in Arabic<span className="opt">optional</span></label>
      {textarea ? <textarea {...common} rows={rows} /> : <input {...common} />}
    </div>
  );
}

export const arText = (row: { ar?: unknown } | null | undefined, field: string): string => {
  const ar = row?.ar && typeof row.ar === 'object' ? (row.ar as Record<string, unknown>)[field] : undefined;
  return typeof ar === 'string' ? ar : '';
};

export const isBilingual = (event: { siteLanguage: string }) => event.siteLanguage !== 'EN';
