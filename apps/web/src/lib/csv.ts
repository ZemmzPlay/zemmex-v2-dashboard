/** One CSV cell. Neutralises spreadsheet formulas (CSV injection). */
export const cell = (v: unknown) => {
  let s = String(v ?? '');
  // Plain numbers such as +971 50 123 4567 cannot carry a formula, so they stay readable.
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d[\d\s]*$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const csvLine = (values: unknown[]) => values.map(cell).join(',');
