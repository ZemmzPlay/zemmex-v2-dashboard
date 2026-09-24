import { revalidatePath } from 'next/cache';
import { prisma, type AssetKind } from '@zemmz/db';
import { eventType } from '@zemmz/shared';
import { can, requirePermission } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { removeAsset, storeUpload, UploadError } from '@/lib/assets';
import { fileUrl } from '@/lib/storage';
import { isSameOrigin } from '@/lib/same-origin';

const KINDS: AssetKind[] = ['LOGO', 'PERSON_PHOTO', 'GALLERY_PHOTO', 'SLIDES'];
const json = (status: number, body: object) => Response.json(body, { status });

/**
 * Uploads a logo, a person's photo, an after-event photo or a session's slides.
 * Multipart: file, kind, and target (person or session ID) where it applies.
 * A new logo, photo or slides file replaces the old one.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!isSameOrigin(req)) return json(403, { error: 'Upload from the dashboard.' });
  const { slug } = await params;
  const { user, event } = await requirePermission(slug, can.editContent);
  if (Number(req.headers.get('content-length') ?? 0) > 26 * 1024 * 1024) return json(413, { error: 'That file is too big. Images can be up to 5 MB and PDFs up to 25 MB.' });
  const fd = await req.formData().catch(() => null);
  const file = fd?.get('file');
  const kind = String(fd?.get('kind') ?? '') as AssetKind;
  const target = String(fd?.get('target') ?? '');
  if (!(file instanceof File) || !KINDS.includes(kind)) return json(400, { error: 'Choose a file to upload.' });
  const TY = eventType(event.type);

  try {
    if (kind === 'LOGO') {
      const a = await storeUpload(event, kind, file);
      const old = event.logoAssetId ? await prisma.asset.findUnique({ where: { id: event.logoAssetId } }) : null;
      await prisma.event.update({ where: { id: event.id }, data: { logoAssetId: a.id } });
      if (old) await removeAsset(old);
      await logActivity(user, event.id, 'uploaded a new logo');
      done(slug);
      return json(200, { url: fileUrl(a.key) });
    }
    if (kind === 'PERSON_PHOTO') {
      const p = await prisma.person.findFirst({ where: { id: target, eventId: event.id }, include: { photo: true } });
      if (!p) return json(404, { error: `That ${TY.person} no longer exists. Reload the page.` });
      const a = await storeUpload(event, kind, file);
      await prisma.person.update({ where: { id: p.id }, data: { photoAssetId: a.id } });
      if (p.photo) await removeAsset(p.photo);
      await logActivity(user, event.id, `uploaded a photo of ${p.name}`);
      done(slug);
      return json(200, { url: fileUrl(a.key) });
    }
    if (kind === 'SLIDES') {
      const s = await prisma.session.findFirst({ where: { id: target, eventId: event.id }, include: { slides: true } });
      if (!s) return json(404, { error: `That ${TY.unit.toLowerCase()} no longer exists. Reload the page.` });
      const a = await storeUpload(event, kind, file, { attendeesOnly: true });
      await prisma.session.update({ where: { id: s.id }, data: { slidesAssetId: a.id } });
      if (s.slides) await removeAsset(s.slides);
      await logActivity(user, event.id, `uploaded slides for ${s.title}`);
      done(slug);
      return json(200, { url: fileUrl(a.key) });
    }
    const count = await prisma.asset.count({ where: { eventId: event.id, kind: 'GALLERY_PHOTO' } });
    if (count >= 300) return json(400, { error: 'The gallery holds up to 300 photos. Remove some first.' });
    const a = await storeUpload(event, kind, file, { attendeesOnly: true });
    await prisma.asset.update({ where: { id: a.id }, data: { sortOrder: count } });
    done(slug);
    return json(200, { url: fileUrl(a.key) });
  } catch (e) {
    if (e instanceof UploadError) return json(400, { error: e.message });
    throw e;
  }
}

function done(slug: string) {
  revalidatePath(`/events/${slug}`, 'layout');
  revalidatePath(`/e/${slug}`, 'layout');
}
