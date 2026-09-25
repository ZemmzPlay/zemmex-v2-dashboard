import { revalidatePath } from 'next/cache';
import { prisma } from '@zemmz/db';
import { can, requirePermission } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { finishVideoUpload, readVideoTicket, removeAsset, UploadError } from '@/lib/assets';
import { isSameOrigin } from '@/lib/same-origin';

/** Step 3: check the file is a video and attach it to the session, replacing any earlier one. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!isSameOrigin(req)) return Response.json({ error: 'Upload from the dashboard.' }, { status: 403 });
  const { slug } = await params;
  const { user, event } = await requirePermission(slug, can.editContent);
  const body = (await req.json().catch(() => ({}))) as { ticket?: string };
  const t = readVideoTicket(String(body.ticket ?? ''), event.id);
  if (!t) return Response.json({ error: 'The upload link ran out. Start again.' }, { status: 403 });
  const session = await prisma.session.findFirst({ where: { id: t.sessionId, eventId: event.id }, include: { recording: true } });
  if (!session) return Response.json({ error: 'That no longer exists. Reload the page.' }, { status: 404 });
  try {
    const a = await finishVideoUpload(event, t);
    await prisma.session.update({ where: { id: session.id }, data: { recordingAssetId: a.id } });
    if (session.recording) await removeAsset(session.recording);
    await logActivity(user, event.id, `uploaded a recording of ${session.title}`);
    revalidatePath(`/events/${slug}`, 'layout');
    revalidatePath(`/e/${slug}`, 'layout');
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof UploadError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
