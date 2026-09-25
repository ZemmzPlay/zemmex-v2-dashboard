'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@zemmz/db';
import { can, requirePermission } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { removeAsset } from '@/lib/assets';

/** Removes an uploaded file of this event: a logo, photo, gallery photo or slides. */
export async function deleteAsset(slug: string, fd: FormData) {
  const { user, event } = await requirePermission(slug, can.editContent);
  const a = await prisma.asset.findFirst({ where: { id: String(fd.get('id') ?? ''), eventId: event.id } });
  if (!a) return;
  await removeAsset(a);
  await logActivity(user, event.id, `removed ${a.kind === 'LOGO' ? 'the logo' : a.kind === 'SLIDES' ? `the slides ${a.name}` : a.kind === 'PERSON_PHOTO' ? 'a photo' : 'a gallery photo'}`);
  revalidatePath(`/events/${slug}`, 'layout');
  revalidatePath(`/e/${slug}`, 'layout');
}

export async function saveRecording(slug: string, sessionId: string, url: string): Promise<{ error?: string; ok?: string }> {
  const { user, event } = await requirePermission(slug, can.editContent);
  const s = await prisma.session.findFirst({ where: { id: sessionId, eventId: event.id } });
  if (!s) return { error: 'That no longer exists. Reload the page.' };
  const v = url.trim();
  if (v && !/^https:\/\/[^\s]+$/i.test(v)) return { error: 'Paste a link that starts with https://' };
  if (v.length > 500) return { error: 'That link is too long.' };
  await prisma.session.update({ where: { id: s.id }, data: { recordingUrl: v } });
  await logActivity(user, event.id, `${v ? 'added' : 'removed'} the recording link for ${s.title}`);
  revalidatePath(`/events/${slug}/certificates`);
  revalidatePath(`/e/${slug}`, 'layout');
  return { ok: v ? 'Saved.' : 'Removed.' };
}
