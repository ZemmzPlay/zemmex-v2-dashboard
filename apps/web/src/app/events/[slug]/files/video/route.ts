import { prisma } from '@zemmz/db';
import { can, requirePermission } from '@/lib/auth';
import { startVideoUpload, UploadError } from '@/lib/assets';
import { isSameOrigin } from '@/lib/same-origin';

/** Step 1 of a video upload: a ticket and where to send the file. JSON { sessionId, name, size }. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!isSameOrigin(req)) return Response.json({ error: 'Upload from the dashboard.' }, { status: 403 });
  const { slug } = await params;
  const { event } = await requirePermission(slug, can.editContent);
  const body = (await req.json().catch(() => ({}))) as { sessionId?: string; name?: string; size?: number };
  const session = await prisma.session.findFirst({ where: { id: String(body.sessionId ?? ''), eventId: event.id } });
  if (!session) return Response.json({ error: 'That no longer exists. Reload the page.' }, { status: 404 });
  try {
    return Response.json(await startVideoUpload(event, session.id, String(body.name ?? ''), Number(body.size ?? 0), slug));
  } catch (e) {
    if (e instanceof UploadError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
