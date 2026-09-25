import 'server-only';
import { createId } from './id';
import { prisma, type Asset, type AssetKind, type Event, type PlayProject } from '@zemmz/db';
import { fileUrl, LIMITS, sniff, storage, type FileKind } from './storage';
import { sealData, unsealData } from './order-tokens';

export class UploadError extends Error {}

const ALLOWED: Record<AssetKind, FileKind[]> = { LOGO: ['image'], PERSON_PHOTO: ['image'], GALLERY_PHOTO: ['image'], SLIDES: ['pdf'], VIDEO: ['video'], PLAY_LOGO: ['image'], TOURNAMENT_BANNER: ['image'], SCREENSHOT: ['image'] };

/** Checks and stores one file for an event. Nothing is written if it's the wrong type or too big. */
export async function storeUpload(event: Event, kind: AssetKind, file: File, opts: { attendeesOnly?: boolean } = {}): Promise<Asset> {
  if (!file.size) throw new UploadError('That file is empty. Choose another.');
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const t = sniff(head);
  const allowed = ALLOWED[kind];
  if (!t || !allowed.includes(t.kind)) {
    throw new UploadError(allowed.includes('pdf') ? 'Slides must be a PDF. Export them as PDF and try again.' : 'Use a PNG, JPG, WebP or GIF image.');
  }
  if (file.size > LIMITS[t.kind]) throw new UploadError(`That file is ${(file.size / 1048576).toFixed(1)} MB. The limit is ${LIMITS[t.kind] / 1048576} MB.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const key = `${event.organisationId}/${event.id}/${kind.toLowerCase()}/${createId()}.${t.ext}`;
  await storage().put(key, bytes, t.type);
  const name = (file.name || `file.${t.ext}`).replace(/[^\w.\- ()]/g, '_').slice(-120);
  return prisma.asset.create({ data: { organisationId: event.organisationId, eventId: event.id, kind, key, name, contentType: t.type, size: file.size, attendeesOnly: !!opts.attendeesOnly } });
}

/** Checks and stores an image for a zemmz Play website (logo or tournament banner). */
export async function storePlayUpload(project: PlayProject, kind: 'PLAY_LOGO' | 'TOURNAMENT_BANNER', file: File): Promise<Asset> {
  if (!file.size) throw new UploadError('That file is empty. Choose another.');
  const t = sniff(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  if (!t || t.kind !== 'image') throw new UploadError('Use a PNG, JPG, WebP or GIF image.');
  if (file.size > LIMITS.image) throw new UploadError(`That image is ${(file.size / 1048576).toFixed(1)} MB. The limit is ${LIMITS.image / 1048576} MB.`);
  const key = `${project.organisationId}/play/${project.id}/${kind.toLowerCase()}/${createId()}.${t.ext}`;
  await storage().put(key, new Uint8Array(await file.arrayBuffer()), t.type);
  const name = (file.name || `image.${t.ext}`).replace(/[^\w.\- ()]/g, '_').slice(-120);
  return prisma.asset.create({ data: { organisationId: project.organisationId, playProjectId: project.id, kind, key, name, contentType: t.type, size: file.size } });
}

/** Removes the row and the bytes. References to it are cleared by the database. */
export async function removeAsset(asset: Pick<Asset, 'id' | 'key'>) {
  await prisma.asset.delete({ where: { id: asset.id } });
  await storage().remove(asset.key).catch(() => undefined);
}

export const assetUrl = (a: Pick<Asset, 'key'> | null | undefined) => (a ? fileUrl(a.key) : null);

/** The event's logo link, or null. */
export async function logoUrlFor(event: Pick<Event, 'logoAssetId'>) {
  if (!event.logoAssetId) return null;
  return assetUrl(await prisma.asset.findUnique({ where: { id: event.logoAssetId }, select: { key: true } }));
}

/* ------------------------------------------------------------------ */
/* Large files: session recordings                                      */
/* ------------------------------------------------------------------ */

/**
 * Videos are too big to pass through a form post. The browser asks for an
 * upload ticket, sends the file straight to storage (a presigned S3 URL, or
 * this app's streaming endpoint on local disk), then asks for it to be
 * checked and attached. The ticket is sealed, so it can't be reused for
 * another event or key, and it runs out after two hours.
 */
export interface VideoTicket {
  key: string;
  eventId: string;
  sessionId: string;
  name: string;
  exp: number;
}

export async function startVideoUpload(event: Event, sessionId: string, name: string, size: number, slug: string) {
  if (!size) throw new UploadError('That file is empty. Choose another.');
  if (size > LIMITS.video) throw new UploadError(`That video is ${(size / 1073741824).toFixed(1)} GB. The limit is ${LIMITS.video / 1073741824} GB; export it at a lower quality and try again.`);
  const ext = /\.(mov|webm)$/i.exec(name)?.[1]?.toLowerCase() ?? 'mp4';
  const key = `${event.organisationId}/${event.id}/video/${createId()}.${ext}`;
  const ticket = sealData('video', { key, eventId: event.id, sessionId, name: name.replace(/[^\w.\- ()]/g, '_').slice(-120) || `recording.${ext}`, exp: Date.now() + 2 * 3_600_000 } satisfies VideoTicket);
  const type = ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : 'video/mp4';
  const direct = await storage().uploadUrl(key, type);
  return { ticket, method: 'PUT', url: direct ?? `/events/${slug}/files/video/upload?ticket=${encodeURIComponent(ticket)}`, contentType: type };
}

export function readVideoTicket(ticket: string, eventId: string): VideoTicket | null {
  const t = unsealData<VideoTicket>('video', ticket);
  return t && t.eventId === eventId && t.exp > Date.now() ? t : null;
}

/** Checks what arrived really is a video, then records it. Removes it if not. */
export async function finishVideoUpload(event: Event, t: VideoTicket): Promise<Asset> {
  const size = await storage().size(t.key);
  if (!size) throw new UploadError('The upload didn’t arrive. Try again.');
  const head = await storage().head(t.key, 16);
  const kind = head ? sniff(head) : null;
  if (!kind || kind.kind !== 'video') {
    await storage().remove(t.key).catch(() => undefined);
    throw new UploadError('That isn’t a video we can play. Upload an MP4, MOV or WebM file.');
  }
  if (size > LIMITS.video) {
    await storage().remove(t.key).catch(() => undefined);
    throw new UploadError('That video is too big.');
  }
  return prisma.asset.create({ data: { organisationId: event.organisationId, eventId: event.id, kind: 'VIDEO', key: t.key, name: t.name, contentType: kind.type, size, attendeesOnly: true } });
}
