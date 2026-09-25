import { escapeHtml } from '@zemmz/shared';

/** The accreditation or attendance sentence, with merge fields filled in. Organiser text is escaped. */
export function certificateBodyHtml(t: { bodyText: string; provider: string }, credits: number, sessionsText: string) {
  return escapeHtml(t.bodyText)
    .replaceAll('{provider}', escapeHtml(t.provider))
    .replaceAll('{credits}', `<b>${credits}</b>`)
    .replaceAll('{sessions}', escapeHtml(sessionsText));
}
