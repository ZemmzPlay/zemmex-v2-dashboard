/**
 * Merge tags in message templates: `{first_name}`, `{registration_id}`.
 * Values are HTML-escaped; unknown tags are left as written so an organiser
 * can see the mistake in the preview.
 */

export const MERGE_TAGS = [
  ['first_name', 'First name'],
  ['last_name', 'Last name'],
  ['full_name', 'Full name'],
  ['registration_id', 'Registration or ticket ID'],
  ['event_name', 'Event name'],
  ['event_dates', 'Event dates'],
  ['venue', 'Venue'],
  ['ticket', 'Ticket type'],
] as const;

export type MergeTag = (typeof MERGE_TAGS)[number][0];
export type MergeValues = Partial<Record<MergeTag, string | number>>;

export function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function applyMergeTags(template: string, values: MergeValues, opts: { html: boolean }): string {
  return template.replace(/\{([a-z_]+)\}/g, (whole, key: string) => {
    if (!(key in values)) return whole;
    const v = values[key as MergeTag];
    return opts.html ? escapeHtml(v) : String(v ?? '');
  });
}

/** Tags only, for subject lines and SMS. */
export function stripHtml(html: string): string {
  return html
    .replace(/<\/(p|h\d|li|div)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
