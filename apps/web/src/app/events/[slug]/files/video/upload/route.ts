import { can, requirePermission } from '@/lib/auth';
import { readVideoTicket } from '@/lib/assets';
import { LIMITS, storage, TooLargeError } from '@/lib/storage';

/** Step 2 on local disk: the file itself, streamed straight to storage (S3 uploads skip this). */
export async function PUT(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { event } = await requirePermission(slug, can.editContent);
  const t = readVideoTicket(new URL(req.url).searchParams.get('ticket') ?? '', event.id);
  if (!t) return Response.json({ error: 'The upload link ran out. Start again.' }, { status: 403 });
  if (!req.body) return Response.json({ error: 'No file arrived.' }, { status: 400 });
  try {
    const size = await storage().writeStream(t.key, req.body, LIMITS.video);
    return Response.json({ ok: true, size });
  } catch (e) {
    if (e instanceof TooLargeError) return Response.json({ error: 'That video is too big.' }, { status: 413 });
    return Response.json({ error: 'The upload was interrupted. Try again.' }, { status: 400 });
  }
}
