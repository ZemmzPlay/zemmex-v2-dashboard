import 'server-only';
import type { Event, MessageTemplate, Registration, TicketType } from '@zemmz/db';
import { applyMergeTags, escapeHtml, eventType, formatDateRange, localise, sanitizeRichText, siteText, stripHtml, textOn, type MergeValues } from '@zemmz/shared';
import { ticketToken } from './tokens';

export const appUrl = () => (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export function mergeValuesFor(event: Event, reg: Pick<Registration, 'firstName' | 'lastName' | 'title' | 'publicId'> & { locale?: string }, ticket?: Pick<TicketType, 'name'> | null): MergeValues {
  return {
    first_name: reg.firstName,
    last_name: reg.lastName,
    full_name: [reg.title, reg.firstName, reg.lastName].filter(Boolean).join(' '),
    registration_id: reg.publicId,
    event_name: event.name,
    event_dates: formatDateRange(event.startsOn, event.endsOn, 'UTC', reg.locale === 'ar' ? 'ar' : 'en'),
    venue: event.venueName,
    ticket: ticket?.name ?? '',
  };
}

/**
 * Wraps organiser-written content in a plain, robust email layout: a coloured
 * band in the event's accent, the message, and the ID in a box.
 */
export function emailLayout(opts: { event: Event; kicker: string; bodyHtml: string; publicId?: number; ticketUrl?: string; locale?: string }) {
  const { event } = opts;
  const TY = eventType(event.type);
  const tx = siteText(TY, opts.locale === 'ar' ? 'ar' : 'en');
  const rtl = tx.dir === 'rtl';
  const ink = textOn(event.accentColour);
  const idBlock = opts.publicId
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;border:1px solid #E6E6F0;border-radius:12px">
        <tr><td style="padding:16px 20px;font:500 12px/1.4 Arial,sans-serif;color:#6B6A85">${escapeHtml(tx.mail.idName)}</td></tr>
        <tr><td style="padding:0 20px 16px;font:700 32px/1 Arial,sans-serif;letter-spacing:.06em;color:#0D0B2E">${opts.publicId}</td></tr>
        ${opts.ticketUrl ? `<tr><td style="padding:0 20px 18px"><a href="${escapeHtml(opts.ticketUrl)}" style="display:inline-block;background:${escapeHtml(event.accentColour)};color:${ink};font:600 14px Arial,sans-serif;text-decoration:none;padding:10px 16px;border-radius:8px">${escapeHtml(tx.mail.showBadge)}</a></td></tr>` : ''}
      </table>`
    : '';
  return `<!doctype html><html lang="${rtl ? 'ar' : 'en'}" dir="${rtl ? 'rtl' : 'ltr'}"><body style="margin:0;background:#F4F5FA" dir="${rtl ? 'rtl' : 'ltr'}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5FA;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:14px;overflow:hidden">
<tr><td style="background:${escapeHtml(event.accentColour)};color:${ink};padding:20px 28px;font:700 12px/1.4 Arial,sans-serif;letter-spacing:.08em">${escapeHtml(opts.kicker)}<div style="font:700 20px/1.3 Arial,sans-serif;letter-spacing:-.01em;margin-top:4px">${escapeHtml(event.name)}</div></td></tr>
<tr><td style="padding:24px 28px 8px;font:400 15px/1.6 Arial,sans-serif;color:#1F1D3D">${opts.bodyHtml}${idBlock}</td></tr>
<tr><td style="padding:16px 28px 24px;font:400 12px/1.5 Arial,sans-serif;color:#6B6A85">${escapeHtml(event.organiserName || event.name)}${event.venueName ? ` · ${escapeHtml(event.venueName)}` : ''}</td></tr>
</table></td></tr></table></body></html>`;
}

/**
 * The confirmation email in the registrant's language: on an Arabic
 * registration, the organiser's Arabic template, event name and ticket name
 * are used wherever they've been written.
 */
export function renderConfirmation(eventIn: Event, templateIn: Pick<MessageTemplate, 'subject' | 'bodyHtml' | 'kicker'> & { ar?: unknown }, reg: Registration, ticketIn: TicketType | null) {
  const locale = reg.locale === 'ar' ? 'ar' : 'en';
  const event = localise(eventIn, locale);
  const template = localise(templateIn, locale);
  const ticket = ticketIn && localise(ticketIn, locale);
  const values = mergeValuesFor(event, reg, ticket);
  const body = applyMergeTags(sanitizeRichText(template.bodyHtml), values, { html: true });
  const subject = applyMergeTags(template.subject, values, { html: false });
  const ticketUrl = `${appUrl()}/e/${event.slug}/t/${ticketToken(reg.id)}`;
  const html = emailLayout({ event, kicker: template.kicker || 'CONFIRMATION', bodyHtml: body, publicId: reg.publicId, ticketUrl, locale: reg.locale });
  const text = `${stripHtml(body)}\n\n${siteText(eventType(event.type), reg.locale === 'ar' ? 'ar' : 'en').mail.idName}: ${reg.publicId}\n${ticketUrl}\n`;
  return { subject, html, text };
}

/** A one-off message; `arabic` is used for people who registered on the Arabic site, when given. */
export function renderBroadcast(eventIn: Event, subjectEn: string, bodyEn: string, reg: Registration, arabic?: { subject: string; bodyHtml: string }) {
  const ar = reg.locale === 'ar';
  const event = localise(eventIn, ar ? 'ar' : 'en');
  const subjectT = ar && arabic?.subject ? arabic.subject : subjectEn;
  const bodyT = ar && arabic?.bodyHtml && stripHtml(arabic.bodyHtml).trim() ? arabic.bodyHtml : bodyEn;
  const values = mergeValuesFor(event, reg);
  const body = applyMergeTags(sanitizeRichText(bodyT), values, { html: true });
  const subject = applyMergeTags(subjectT, values, { html: false });
  return {
    subject,
    html: emailLayout({ event, kicker: 'UPDATE', bodyHtml: body, locale: reg.locale }),
    text: stripHtml(body),
  };
}
