import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@zemmz/db';
import { can, requirePermission } from '@/lib/auth';
import { applyOfflineScans } from '@/lib/checkin';
import { isSameOrigin } from '@/lib/same-origin';

const batch = z.object({
  scans: z.array(z.object({ id: z.string().uuid(), mode: z.enum(['in', 'out']), input: z.string().trim().min(1).max(40), at: z.string().datetime() })).max(500),
});

/**
 * Scans made while the console was offline, in the order they happened.
 * Each is applied at the time it was made; the device's id makes a retried
 * upload safe. The server's answer is final: a scan the device accepted can
 * still be refused here (another desk let them in first, say), and the
 * console shows those.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string; sessionId: string }> }) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Cross-site request refused' }, { status: 403 });
  const { slug, sessionId } = await params;
  const { user, event } = await requirePermission(slug, can.checkIn);
  const parsed = batch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Those scans couldn’t be read.' }, { status: 400 });
  const session = await prisma.session.findFirst({ where: { id: sessionId, eventId: event.id }, select: { id: true } });
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { results, counts: last } = await applyOfflineScans({ event, sessionId, userId: user.id, scans: parsed.data.scans });
  return NextResponse.json({ results, counts: last });
}
