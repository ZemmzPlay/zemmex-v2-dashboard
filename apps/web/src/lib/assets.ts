import 'server-only';
import { createId } from './id';
import { prisma, type Asset, type AssetKind, type Event } from '@zemmz/db';
import { fileUrl, LIMITS, sniff, storage } from './storage';

export class UploadError extends Error {}

const ALLOWED: Record<AssetKind, ('image' | 'pdf')[]> = { LOGO: ['image'], PERSON_PHOTO: ['image'], GALLERY_PHOTO: ['image'], SLIDES: ['pdf'] };

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
