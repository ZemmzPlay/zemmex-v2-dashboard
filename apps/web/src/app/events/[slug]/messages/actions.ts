'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@zemmz/db';
import { broadcastSchema, messageTemplateSchema, stripHtml } from '@zemmz/shared';
import { can, requirePermission } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { renderBroadcast } from '@/lib/email';
import { AUDIENCES, audienceWhere } from '@/lib/audiences';

export interface MsgState {
  ok?: string;
  error?: string;
}

export async function saveTemplate(slug: string, _p: MsgState, fd: FormData): Promise<MsgState> {
  const { user, event } = await requirePermission(slug, can.sendMessages);
  const parsed = messageTemplateSchema.safeParse({ subject: fd.get('subject'), bodyHtml: fd.get('bodyHtml') });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await prisma.messageTemplate.upsert({
    where: { eventId_kind: { eventId: event.id, kind: 'CONFIRMATION' } },
    update: { subject: parsed.data.subject, bodyHtml: parsed.data.bodyHtml, kicker: String(fd.get('kicker') ?? '').slice(0, 40) },
    create: { eventId: event.id, kind: 'CONFIRMATION', subject: parsed.data.subject, bodyHtml: parsed.data.bodyHtml, kicker: String(fd.get('kicker') ?? '').slice(0, 40) },
  });
  await logActivity(user, event.id, 'edited the confirmation email');
  revalidatePath(`/events/${slug}/messages`);
  return { ok: 'Saved. New registrations get this version.' };
}

export async function sendBroadcast(slug: string, _p: MsgState, fd: FormData): Promise<MsgState> {
  const { user, event } = await requirePermission(slug, can.sendMessages);
  const parsed = broadcastSchema.safeParse({ audience: fd.get('audience'), channel: fd.get('channel'), subject: fd.get('subject'), bodyHtml: fd.get('bodyHtml') });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { audience, channel, subject, bodyHtml } = parsed.data;

  const recipients = await prisma.registration.findMany({ where: audienceWhere(event.id, audience), orderBy: { publicId: 'asc' } });
  const usable = recipients.filter((r) => (channel === 'sms' ? !!r.mobile : !!r.email));
  if (!usable.length) return { error: `Nobody in “${AUDIENCES[audience]}” has ${channel === 'sms' ? 'a mobile number' : 'an email address'}.` };

  await prisma.$transaction(async (tx) => {
    const b = await tx.broadcast.create({
      data: { eventId: event.id, audience: AUDIENCES[audience], channel: channel === 'sms' ? 'SMS' : 'EMAIL', subject, bodyHtml, recipientCount: usable.length, sentById: user.id, sentByLabel: user.name },
    });
    const rows = usable.map((r) => {
      const m = renderBroadcast(event, subject, bodyHtml, r);
      return channel === 'sms'
        ? { eventId: event.id, registrationId: r.id, broadcastId: b.id, channel: 'SMS' as const, toAddress: r.mobile, toName: `${r.firstName} ${r.lastName}`, subject: m.subject, html: '', text: stripHtml(`${m.subject}. ${m.text}`).slice(0, 480) }
        : { eventId: event.id, registrationId: r.id, broadcastId: b.id, channel: 'EMAIL' as const, toAddress: r.email, toName: `${r.firstName} ${r.lastName}`, subject: m.subject, html: m.html, text: m.text };
    });
    for (let i = 0; i < rows.length; i += 1000) await tx.outboundMessage.createMany({ data: rows.slice(i, i + 1000) });
  });
  await logActivity(user, event.id, `sent “${subject}” to ${usable.length} ${usable.length === 1 ? 'person' : 'people'} by ${channel === 'sms' ? 'SMS' : 'email'}`);
  revalidatePath(`/events/${slug}/messages`);
  return { ok: `Queued for ${usable.length} ${usable.length === 1 ? 'person' : 'people'}. Delivery starts within 20 seconds.` };
}
