import { revalidatePath } from 'next/cache';
import { prisma } from '@zemmz/db';
import { removeAsset, storePlayUpload, UploadError } from '@/lib/assets';
import { logPlay, playCan, requireProjectPermission } from '@/lib/play/core';
import { fileUrl } from '@/lib/storage';
import { isSameOrigin } from '@/lib/same-origin';

const json = (status: number, body: object) => Response.json(body, { status });

/** The website's logo, or a tournament's banner (target: the tournament ID). Each replaces the old one. */
export async function POST(req: Request, { params }: { params: Promise<{ project: string }> }) {
  if (!isSameOrigin(req)) return json(403, { error: 'Upload from the dashboard.' });
  const { project: slug } = await params;
  const { user, project } = await requireProjectPermission(slug, playCan.editWebsite);
  if (Number(req.headers.get('content-length') ?? 0) > 6 * 1024 * 1024) return json(413, { error: 'That image is too big. The limit is 5 MB.' });
  const fd = await req.formData().catch(() => null);
  const file = fd?.get('file');
  const kind = String(fd?.get('kind') ?? '');
  if (!(file instanceof File) || (kind !== 'PLAY_LOGO' && kind !== 'TOURNAMENT_BANNER')) return json(400, { error: 'Choose an image to upload.' });
  try {
    if (kind === 'PLAY_LOGO') {
      const a = await storePlayUpload(project, kind, file);
      const old = project.logoAssetId ? await prisma.asset.findUnique({ where: { id: project.logoAssetId } }) : null;
      await prisma.playProject.update({ where: { id: project.id }, data: { logoAssetId: a.id } });
      if (old) await removeAsset(old);
      await logPlay(project.id, user.name, 'uploaded a new logo');
      revalidatePath(`/play/${slug}`, 'layout');
      revalidatePath(`/p/${slug}`, 'layout');
      return json(200, { url: fileUrl(a.key) });
    }
    const t = await prisma.tournament.findFirst({ where: { id: String(fd?.get('target') ?? ''), projectId: project.id } });
    if (!t) return json(404, { error: 'That tournament no longer exists. Reload the page.' });
    const a = await storePlayUpload(project, kind, file);
    const old = t.bannerAssetId ? await prisma.asset.findUnique({ where: { id: t.bannerAssetId } }) : null;
    await prisma.tournament.update({ where: { id: t.id }, data: { bannerAssetId: a.id } });
    if (old) await removeAsset(old);
    await logPlay(project.id, user.name, `uploaded a banner for ${t.name}`);
    revalidatePath(`/play/${slug}`, 'layout');
    revalidatePath(`/p/${slug}`, 'layout');
    return json(200, { url: fileUrl(a.key) });
  } catch (e) {
    if (e instanceof UploadError) return json(400, { error: e.message });
    throw e;
  }
}
